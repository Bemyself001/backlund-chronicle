package io.github.bemyself001.backlundchronicle.nativeui

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.TimeUnit
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test

class NativeUiTest {
    @get:Rule val compose = createAndroidComposeRule<NativeActivity>()
    private fun screenshot(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val file = File(instrumentation.targetContext.getExternalFilesDir(null), "native-evidence/$name.png")
        file.parentFile!!.mkdirs()
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap -> file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle() }
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
            server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""{"choices":[{"message":{"content":"这条响应不应提交"}}]}""").setBodyDelay(20, TimeUnit.SECONDS))
            val model = compose.activity.model
            val before = model.state.value.game!!
            val settings = JSONObject(model.state.value.settings.toString()).put("baseUrl", server.url("/v1").toString()).put("persistKey", false)
            model.saveSettings(settings, "test-only-key", model.state.value.prompt)
            compose.waitUntil(15_000) { !model.state.value.busy }
            model.action("跳过时间2小时")
            compose.waitUntil(15_000) { model.state.value.phase == "规划行动" }
            model.cancel()
            compose.waitUntil(15_000) { !model.state.value.busy }
            assertEquals(before.getInt("turn"), model.state.value.game!!.getInt("turn"))
            assertEquals(before.getString("worldTime"), model.state.value.game!!.getString("worldTime"))
            val game = model.state.value.game!!
            model.special(JSONObject().put("operation", "wait").put("hours", 1).put("revision", game.getJSONObject("special").getInt("revision")).put("expectedTurn", game.getInt("turn")).put("expectedWorldTime", game.getString("worldTime")))
            compose.waitUntil(15_000) { !model.state.value.busy }
            assertEquals(before.getInt("turn") + 1, model.state.value.game!!.getInt("turn"))
            assertFalse(model.state.value.error, model.state.value.error.isNotBlank())
        }
    }
}
