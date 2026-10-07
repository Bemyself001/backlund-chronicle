package io.github.bemyself001.backlundchronicle.nativeui

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.platform.io.PlatformTestStorageRegistry
import java.util.concurrent.TimeUnit
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
    private fun screenshot(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot()) { "Android did not provide a screenshot" }
        try { PlatformTestStorageRegistry.getInstance().openOutputFile("native-evidence/$name.png").use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } }
        finally { bitmap.recycle() }
    }
    @Test fun createReadNavigateWaitAndSaveWithNativeWidgets() {
        compose.waitUntil(30_000) { compose.activity.model.state.value.ready }
        compose.onNodeWithText("创建角色").performClick()
        compose.onNodeWithText("姓名").performTextInput("原生验证")
        compose.onNodeWithText("进入贝克兰德").performScrollTo().performClick()
        compose.waitUntil(15_000) { compose.activity.model.state.value.game != null && !compose.activity.model.state.value.busy }
        compose.onNodeWithText("自由行动").assertExists()
        screenshot("story")
        compose.onNodeWithText("地图", useUnmergedTree = true).performClick()
        compose.onNodeWithContentDescription("贝克兰德六边形地图，支持缩放和点选").assertExists()
        screenshot("map")
        compose.onNodeWithText("任务", useUnmergedTree = true).performClick()
        compose.onNodeWithText("我发布的委托").assertExists()
        compose.onNodeWithText("菜单", useUnmergedTree = true).performClick()
        compose.onNodeWithText("特殊行动与人物拜访").performClick()
        compose.onNodeWithText("等待").performScrollTo().performClick()
        compose.onNodeWithText("确认等待1小时").performClick()
        compose.waitUntil(15_000) { compose.activity.model.state.value.game?.optInt("turn") == 1 && !compose.activity.model.state.value.busy }
        compose.onNodeWithText("菜单", useUnmergedTree = true).performClick()
        compose.onNodeWithText("存档柜").performClick()
        compose.onAllNodesWithText("保存")[0].performClick()
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
            screenshot("settled-story")
        }
    }
}
