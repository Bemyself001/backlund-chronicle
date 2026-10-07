package io.github.bemyself001.backlundchronicle.nativeui

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
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
    }
}
