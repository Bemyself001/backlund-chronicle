package io.github.bemyself001.backlundchronicle.nativeui

import android.graphics.Bitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.io.PlatformTestStorageRegistry
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test

class NativeUiTest {
    @get:Rule val compose = createAndroidComposeRule<NativeActivity>()
    private fun screenshot(name: String, tag: String? = null) {
        compose.waitForIdle()
        val bitmap = (if (tag == null) compose.onRoot() else compose.onNodeWithTag(tag)).captureToImage().asAndroidBitmap()
        try { PlatformTestStorageRegistry.getInstance().openOutputFile("native-evidence/$name.png").use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } }
        finally { bitmap.recycle() }
    }
    private fun assertWaitHours(hours: Int) = compose.onNodeWithTag("wait-dial").assert(SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo(hours.toFloat(), 1f..24f, 22)))
    private fun clockPoint(degrees: Float, width: Float, height: Float): Offset {
        val radians = Math.toRadians(degrees.toDouble()); val radius = width * .365f
        return Offset(width / 2f + kotlin.math.sin(radians).toFloat() * radius, height / 2f - kotlin.math.cos(radians).toFloat() * radius)
    }
    @Test fun createReadNavigateWaitAndSaveWithNativeWidgets() {
        compose.waitUntil(30_000) { compose.activity.model.state.value.ready }
        compose.onNodeWithText("创建角色").performClick()
        compose.onNodeWithText("姓名").performTextInput("原生验证")
        compose.onNodeWithText("进入贝克兰德").performScrollTo().performClick()
        compose.waitUntil(15_000) { compose.activity.model.state.value.game != null && !compose.activity.model.state.value.busy }
        compose.onNodeWithText("自由行动").assertExists()
        compose.onNodeWithTag("native-day").assertExists()
        listOf("health", "sanity", "spirituality").forEach { compose.onNodeWithTag("vital-$it").assertExists() }
        screenshot("story")
        val clockBefore = compose.activity.model.state.value.game!!
        compose.onNodeWithTag("shortcut-wait").performClick()
        assertWaitHours(1)
        compose.onNodeWithTag("wait-decrease").assertIsNotEnabled()
        compose.onNodeWithTag("wait-preset-6").performClick()
        assertWaitHours(6)
        val sixHours = clockBefore.getJSONObject("quickWait").getJSONArray("previews").getJSONObject(5)
        assertEquals("次日", sixHours.getString("dayLabel"))
        compose.onNodeWithText(sixHours.getString("endClock")).assertExists()
        screenshot("wait-day", "wait-sheet")
        compose.onNodeWithTag("wait-preset-12").performClick()
        assertWaitHours(12)
        compose.onNodeWithTag("wait-preset-24").performClick()
        assertWaitHours(24)
        compose.onNodeWithTag("wait-increase").assertIsNotEnabled()
        compose.onNodeWithTag("wait-dial").performSemanticsAction(SemanticsActions.SetProgress) { it(1f) }
        assertWaitHours(1)
        val startAngle = sixHours.getDouble("startHours").toFloat() * 15f
        // A real drag crosses the 00:00 seam from five to seven hours.
        compose.onNodeWithTag("wait-dial").performTouchInput {
            down(clockPoint(startAngle + 75f, width.toFloat(), height.toFloat()))
            moveTo(clockPoint(startAngle + 90f, width.toFloat(), height.toFloat()))
            moveTo(clockPoint(startAngle + 105f, width.toFloat(), height.toFloat()))
            up()
        }
        assertWaitHours(7)
        compose.onNodeWithTag("wait-dial").performTouchInput {
            down(clockPoint(startAngle + 180f, width.toFloat(), height.toFloat()))
            moveTo(clockPoint(startAngle + 195f, width.toFloat(), height.toFloat()))
            cancel()
        }
        assertWaitHours(7)
        compose.onNodeWithTag("wait-cancel").performClick()
        assertEquals(clockBefore.getInt("turn"), compose.activity.model.state.value.game!!.getInt("turn"))
        assertEquals(clockBefore.getString("worldTime"), compose.activity.model.state.value.game!!.getString("worldTime"))
        compose.onNodeWithTag("shortcut-special").performClick()
        compose.onNodeWithText("日常与非凡").assertExists()
        compose.onNodeWithTag("nav-map").performClick()
        compose.onNodeWithContentDescription("贝克兰德六边形地图，支持缩放和点选").assertExists()
        screenshot("map")
        compose.onNodeWithTag("nav-quests").performClick()
        compose.onNodeWithText("我发布的委托").assertExists()
        compose.onNodeWithTag("nav-menu").performClick()
        compose.onNodeWithText("特殊行动与人物拜访").performClick()
        compose.onNodeWithText("等待").performScrollTo().performClick()
        compose.onNodeWithTag("wait-confirm").performScrollTo().performClick()
        compose.waitUntil(15_000) { compose.activity.model.state.value.game?.optInt("turn") == 1 && !compose.activity.model.state.value.busy }
        compose.onNodeWithTag("nav-menu").performClick()
        compose.onNodeWithText("存档柜").performClick()
        compose.onNodeWithTag("save-slot-1").performScrollTo().performClick()
        compose.waitUntil(15_000) { compose.activity.model.state.value.saves.getOrNull(1)?.contains("第1轮") == true }
        screenshot("saves")
        // A real native network cancellation must leave the runtime usable.
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
            val model = compose.activity.model
            val before = model.state.value.game!!
            val settings = JSONObject(model.state.value.settings.toString()).put("baseUrl", server.url("/v1").toString()).put("persistKey", false)
            model.saveSettings(settings, "test-only-key", model.state.value.prompt)
            compose.waitUntil(15_000) { !model.state.value.busy }
            model.action("跳过时间2小时")
            compose.waitUntil(15_000) { model.state.value.phase == "规划行动" }
            assertNotNull("The native HTTP request must reach the server before cancellation", server.takeRequest(10, TimeUnit.SECONDS))
            model.cancel()
            compose.waitUntil(15_000) { !model.state.value.busy }
            assertEquals(before.getInt("turn"), model.state.value.game!!.getInt("turn"))
            assertEquals(before.getString("worldTime"), model.state.value.game!!.getString("worldTime"))
            val game = model.state.value.game!!
            model.special(JSONObject().put("operation", "wait").put("hours", 1).put("revision", game.getJSONObject("special").getInt("revision")).put("expectedTurn", game.getInt("turn")).put("expectedWorldTime", game.getString("worldTime")))
            compose.waitUntil(15_000) { !model.state.value.busy }
            assertEquals(before.getInt("turn") + 1, model.state.value.game!!.getInt("turn"))
            assertFalse(model.state.value.error, model.state.value.error.isNotBlank())
            model.load(1)
            compose.waitUntil(15_000) { !model.state.value.busy }
            assertEquals(before.getInt("turn"), model.state.value.game!!.getInt("turn"))
            assertEquals(before.getString("worldTime"), model.state.value.game!!.getString("worldTime"))
            // Exercise native HTTP -> QuickJS planning -> durable narrative settlement.
            val planning = JSONObject().put("choices", org.json.JSONArray().put(JSONObject().put("message", JSONObject().put("content", "{\"toolCalls\":[]}"))))
            val narrative = JSONObject().put("narrative", "你完成了等候，钟声已过去两小时。")
                .put("choices", org.json.JSONArray().put(JSONObject().put("label", "继续观察街边的人群").put("risk", "low"))
                    .put(JSONObject().put("label", "向店主询问工作").put("risk", "low"))
                    .put(JSONObject().put("label", "沿街道寻找旅店").put("risk", "medium")))
            val rendering = JSONObject().put("choices", org.json.JSONArray().put(JSONObject().put("message", JSONObject().put("content", narrative.toString()))))
            server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody(planning.toString()))
            server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody(rendering.toString()))
            model.action("跳过时间2小时")
            compose.waitUntil(20_000) { !model.state.value.busy }
            assertFalse(model.state.value.error, model.state.value.error.isNotBlank())
            assertEquals(before.getInt("turn") + 1, model.state.value.game!!.getInt("turn"))
            assertNotEquals(before.getString("worldTime"), model.state.value.game!!.getString("worldTime"))
            assertEquals(3, model.state.value.game!!.getJSONArray("choices").length())
            compose.onNodeWithText("你完成了等候，钟声已过去两小时。").assertExists()
            compose.onNodeWithText(model.state.value.game!!.getString("worldTime")).assertExists()
            screenshot("settled-story")
            model.saveSettings(JSONObject(model.state.value.settings.toString()).put("readingDark", true), model.apiKey, model.state.value.prompt)
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.settings.optBoolean("readingDark") }
            compose.onNodeWithTag("native-night").assertExists()
            screenshot("story-night")
            compose.onNodeWithTag("shortcut-wait").performClick()
            compose.onNodeWithTag("wait-preset-6").performClick()
            assertWaitHours(6)
            screenshot("wait-night", "wait-sheet")
            compose.onNodeWithTag("wait-cancel").performClick()

            // Waiting remains visibly disabled during an imported active encounter.
            val combatSave = JSONObject(runBlocking { model.exportSave() })
            combatSave.getJSONObject("game").getJSONObject("character").getJSONObject("stats").put("health", 1)
            combatSave.getJSONObject("game").put("combat", JSONObject().put("enemies", org.json.JSONArray().put(JSONObject().put("id", "clock-foe").put("name", "时钟测试敌人").put("maxHealth", 1).put("health", 1).put("status", "active").put("stunnedThroughTurn", 99))))
            model.importSave(combatSave.toString())
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.game?.getJSONObject("quickWait")?.getString("disabledReason")?.isNotBlank() == true }
            val combatBefore = model.state.value.game!!
            compose.onNodeWithTag("shortcut-wait").performClick()
            compose.onNodeWithTag("wait-dial").assertIsNotEnabled()
            compose.onNodeWithTag("wait-confirm").assertIsNotEnabled()
            compose.onNodeWithTag("wait-disabled-reason").assertTextContains("战斗中无法快速等待", substring = true)
            compose.onNodeWithTag("wait-cancel").performClick()
            assertEquals(combatBefore.getInt("turn"), model.state.value.game!!.getInt("turn"))
            assertEquals(combatBefore.getString("worldTime"), model.state.value.game!!.getString("worldTime"))
            compose.onNodeWithContentDescription("偏低", substring = true).assertExists()
            compose.onNodeWithTag("vital-health").performClick()
            compose.onNodeWithTag("nav-character").assertIsSelected()
        }
    }
}
