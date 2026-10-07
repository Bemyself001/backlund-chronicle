package io.github.bemyself001.backlundchronicle.nativeui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

internal fun JSONObject.text(key: String, fallback: String = "") = if (isNull(key)) fallback else optString(key, fallback)
internal fun JSONObject.obj(key: String) = optJSONObject(key) ?: JSONObject()
internal fun JSONObject.array(key: String) = optJSONArray(key) ?: JSONArray()
internal fun JSONArray.objects() = (0 until length()).mapNotNull { optJSONObject(it) }
internal fun JSONArray.strings() = (0 until length()).map { optString(it) }

class NativeActivity : ComponentActivity() {
    val model: GameViewModel by viewModels()
    private val openSave = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) lifecycleScope.launch {
            try {
                val text = withContext(Dispatchers.IO) {
                    val input = contentResolver.openInputStream(uri) ?: error("无法打开存档文件")
                    input.bufferedReader().use { reader ->
                        val content = StringBuilder(); val buffer = CharArray(8192)
                        while (true) { val count = reader.read(buffer); if (count < 0) break; content.append(buffer, 0, count); require(content.length <= 20 * 1024 * 1024) { "存档文件超过20MB" } }
                        content.toString()
                    }
                }
                model.importSave(text)
            } catch (error: Exception) { model.reportError(error.message ?: "存档导入失败") }
        }
    }
    private val exportSave = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) lifecycleScope.launch {
            try {
                val payload = model.exportSave()
                withContext(Dispatchers.IO) { contentResolver.openOutputStream(uri, "wt")?.bufferedWriter()?.use { it.write(payload) } ?: error("无法写入文件") }
            } catch (error: Exception) { model.reportError(error.message ?: "存档导出失败") }
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { NativeGameApp(model, { openSave.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }, { exportSave.launch("贝克兰德纪事-原生存档.json") }) }
    }
}

private val Green = Color(0xFF173E35)
private val Brass = Color(0xFFAD8650)
private val Paper = Color(0xFFF4EEDF)
private val Ink = Color(0xFF29372F)

@Composable
fun NativeGameApp(model: GameViewModel, onImport: () -> Unit = {}, onExport: () -> Unit = {}) {
    val state by model.state.collectAsStateWithLifecycle()
    val dark = state.settings.optBoolean("readingDark")
    val colors = if (dark) darkColorScheme(primary = Color(0xFFCBA877), secondary = Color(0xFFB0CBB8), background = Color(0xFF15241E), surface = Color(0xFF20362C))
        else lightColorScheme(primary = Green, secondary = Brass, background = Paper, surface = Color(0xFFFAF6EC), onSurface = Ink)
    MaterialTheme(colorScheme = colors) {
        val holder = rememberSaveableStateHolder()
        var draft by rememberSaveable { mutableStateOf("") }
        Scaffold(
            topBar = { Column(Modifier.background(Green).statusBarsPadding().padding(horizontal = 18.dp, vertical = 12.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("贝克兰德纪事", color = Paper, fontFamily = FontFamily.Serif, fontSize = 23.sp, modifier = Modifier.weight(1f))
                    Text("原生版", color = Color(0xFFD2B17C), fontSize = 12.sp)
                }
                state.game?.let { game ->
                    Text("${game.obj("location").text("name")} · 第${game.optInt("turn")}轮", color = Paper, fontSize = 13.sp)
                    Text(game.text("worldTime"), color = Color(0xFFCDCFB8), fontSize = 12.sp)
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        val stats = game.obj("character").obj("stats")
                        listOf(Triple("生命", "health", "maxHealth"), Triple("理智", "sanity", "maxSanity"), Triple("灵性", "spirituality", "maxSpirituality")).forEach { (label, value, max) ->
                            Text("$label ${stats.optInt(value)}/${stats.optInt(max)}", color = Paper, fontSize = 13.sp)
                        }
                    }
                    Text(game.text("moneyLabel"), color = Color(0xFFD2B17C), fontSize = 12.sp)
                }
            } },
            bottomBar = { if (state.game != null) Column(Modifier.navigationBarsPadding().imePadding()) {
                if (state.panel == "story") Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(draft, { draft = it }, Modifier.weight(1f), label = { Text("自由行动") }, maxLines = 3,
                        enabled = !state.busy, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { if (draft.isNotBlank() && !state.busy) { model.action(draft); draft = "" } }))
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { model.action(draft); draft = "" }, enabled = !state.busy && draft.isNotBlank()) { Text("行动") }
                }
                Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)) {
                    listOf("story" to "剧情", "map" to "地图", "quests" to "任务", "inventory" to "行囊", "character" to "角色", "menu" to "菜单").forEach { (id, label) ->
                        TextButton(onClick = { model.panel(id) }, modifier = Modifier.weight(1f), contentPadding = PaddingValues(vertical = 10.dp, horizontal = 0.dp)) {
                            Text(label, fontSize = 13.sp, fontWeight = if (state.panel == id) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                }
            } },
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                if (state.busy) {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(state.phase.ifBlank { "处理中" }, Modifier.weight(1f), fontSize = 13.sp)
                        TextButton(onClick = model::cancel) { Text("取消") }
                    }
                }
                if (state.error.isNotBlank()) Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.errorContainer).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(state.error, Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer, fontSize = 13.sp)
                    if (state.game != null && !state.busy) TextButton(onClick = model::retry) { Text("重试") }
                }
                if (state.notice.isNotBlank()) Text(state.notice, Modifier.padding(14.dp), fontSize = 13.sp)
                holder.SaveableStateProvider(state.panel) {
                    when (state.panel) {
                        "create" -> CreateCharacter(state, model)
                        "settings" -> SettingsPanel(state, model)
                        "saves" -> SavePanel(state, model, onImport, onExport)
                        "story" -> StoryPanel(state, model)
                        "map" -> MapPanel(state, model)
                        "quests" -> QuestPanel(state, model)
                        "inventory" -> InventoryPanel(state, model)
                        "character" -> CharacterPanel(state, model)
                        "special" -> SpecialPanel(state, model)
                        "notes" -> NotesPanel(state)
                        "menu" -> MenuPanel(state, model, onImport, onExport)
                        else -> WelcomePanel(state, model, onImport)
                    }
                }
            }
        }
        state.confirmations?.let { changes ->
            var approved by remember(changes) { mutableStateOf(changes.objects().map { it.text("key") }.toSet()) }
            AlertDialog(onDismissRequest = model::cancel, title = { Text("确认本轮重要变化") },
                text = { Column(Modifier.verticalScroll(rememberScrollState())) { changes.objects().forEach { change ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(change.text("key") in approved, { checked -> approved = if (checked) approved + change.text("key") else approved - change.text("key") })
                        Column { Text("${if (change.text("direction") == "gain") "获得" else "失去"} ${change.text("name", "物品或晋升变化")} ×${change.optInt("quantity", 1)}", fontWeight = FontWeight.Bold); Text(change.text("reason"), fontSize = 13.sp) }
                    }
                } } },
                confirmButton = { Button(onClick = { model.confirm(JSONArray(approved.toList())) }) { Text("确认选择") } },
                dismissButton = { TextButton(onClick = model::cancel) { Text("取消本轮") } })
        }
    }
}

@Composable
private fun Page(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, fontSize = 25.sp, fontFamily = FontFamily.Serif, color = MaterialTheme.colorScheme.primary)
        content()
        Spacer(Modifier.height(20.dp))
    }
}
@Composable
private fun CardBlock(title: String, description: String = "", content: @Composable ColumnScope.() -> Unit = {}) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            if (description.isNotBlank()) Text(description, fontSize = 14.sp, lineHeight = 22.sp)
            content()
        }
    }
}
@Composable
private fun Chips(values: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        values.forEach { (id, label) -> FilterChip(selected == id, { onSelect(id) }, label = { Text(label) }) }
    }
}
@Composable
private fun WelcomePanel(state: GameUiState, model: GameViewModel, onImport: () -> Unit) = Page("雾都，等待你的故事") {
    Text("在鲁恩王国首都贝克兰德，选择你的身份、生活与调查方向。", lineHeight = 26.sp)
    if (!state.ready) CircularProgressIndicator()
    Button(onClick = { model.panel("create") }, enabled = state.ready && !state.busy, modifier = Modifier.fillMaxWidth()) { Text("创建角色") }
    Button(onClick = { model.load(0) }, enabled = state.ready && !state.busy && state.saves.getOrNull(0) != "空存档", modifier = Modifier.fillMaxWidth()) { Text("继续自动存档") }
    OutlinedButton(onClick = onImport, enabled = state.ready && !state.busy, modifier = Modifier.fillMaxWidth()) { Text("导入已有存档") }
    Text("从旧版或网页版的存档柜导出JSON，再在这里导入，即可继续故事。原生预览版与正式版可同时安装。", fontSize = 13.sp)
    TextButton(onClick = { model.panel("settings") }) { Text("设置API与阅读偏好") }
    TextButton(onClick = { model.panel("saves") }) { Text("打开存档柜") }
    Text("${BuildConfig.VERSION_NAME} · Android原生界面", fontSize = 12.sp)
}

@Composable
private fun CreateCharacter(state: GameUiState, model: GameViewModel) {
    var encoded by rememberSaveable { mutableStateOf(state.catalog.obj("character").toString()) }
    val character = JSONObject(encoded)
    fun update(key: String, value: Any) { encoded = JSONObject(encoded).put(key, value).toString() }
    Page("建立你的档案") {
        listOf("name" to "姓名", "gender" to "性别", "age" to "年龄").forEach { (id, label) ->
            OutlinedTextField(character.text(id), { value -> update(id, if (id == "age") value.toIntOrNull() ?: 24 else value) }, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = if (id == "age") KeyboardType.Number else KeyboardType.Text))
        }
        Text("故事开始的城区")
        Chips(state.catalog.array("openings").objects().map { it.text("district") to it.text("district") }, character.text("startingDistrict")) { update("startingDistrict", it) }
        Text(state.catalog.array("openings").objects().firstOrNull { it.text("district") == character.text("startingDistrict") }?.text("summary") ?: "", fontSize = 13.sp)
        Text("初始身份")
        Chips(listOf("ordinary" to "普通人", "low" to "序列9非凡者"), character.text("extraordinary")) { update("extraordinary", it); if (it == "low" && character.text("pathway") == "无") update("pathway", "${state.catalog.array("pathways").objects().first().text("name")}（序列9）") }
        if (character.text("extraordinary") == "low") Chips(state.catalog.array("pathways").objects().map { "${it.text("name")}（序列9）" to it.text("name") }, character.text("pathway")) { update("pathway", it) }
        Text("天赋")
        Chips(state.catalog.array("talents").objects().map { it.text("id") to it.text("name") }, character.text("talent")) { update("talent", it) }
        listOf("appearance" to "外貌", "origin" to "出身", "occupation" to "职业", "clothingDescription" to "随身衣着", "carriedItemName" to "随身物品名称", "carriedItemDescription" to "物品描述", "personality" to "性格", "desire" to "愿望", "fear" to "恐惧", "secret" to "秘密", "background" to "背景").forEach { (id, label) ->
            OutlinedTextField(character.text(id), { update(id, it) }, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), minLines = if (id == "background") 3 else 1)
        }
        OutlinedTextField(character.text("startingMoneyPence"), { update("startingMoneyPence", it.toIntOrNull() ?: 0) }, label = { Text("起始资金（便士）") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
        Button(onClick = { model.create(character) }, enabled = !state.busy && character.text("name").isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("进入贝克兰德") }
        TextButton(onClick = { model.panel("home") }) { Text("返回首页") }
    }
}

@Composable
private fun StoryPanel(state: GameUiState, model: GameViewModel) {
    val game = state.game ?: return
    val history = game.array("storyHistory").objects()
    val listState = rememberLazyListState()
    val fontSize = state.settings.optInt("readingFontSize", 18).coerceIn(16, 22)
    LaunchedEffect(game.optInt("turn")) { if (history.isNotEmpty()) listState.scrollToItem(history.lastIndex) }
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 18.dp), state = listState, verticalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(vertical = 20.dp)) {
        items(history, key = { it.text("id", "${it.optInt("turn")}-${it.text("role")}-${it.text("content").hashCode()}") }) { message ->
            if (message.text("role") == "user") Text("第${message.optInt("turn")}轮 · ${message.text("content")}", color = MaterialTheme.colorScheme.secondary, fontSize = 13.sp)
            else SelectionContainer { Text(message.text("content"), fontSize = fontSize.sp, lineHeight = (fontSize * 1.8f).sp, fontFamily = FontFamily.Serif) }
        }
        if (state.preview.isNotBlank()) item { Text(state.preview, fontSize = fontSize.sp, lineHeight = (fontSize * 1.8f).sp) }
        item { HorizontalDivider(color = MaterialTheme.colorScheme.secondary.copy(alpha = .3f)); Text("接下来，你打算怎么做？", Modifier.padding(top = 18.dp), fontWeight = FontWeight.SemiBold) }
        items(game.array("choices").objects()) { choice ->
            OutlinedButton(onClick = { model.action(choice.text("label")) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(14.dp)) { Text(choice.text("label"), Modifier.fillMaxWidth(), lineHeight = 23.sp) }
        }
        if (game.array("choices").length() != 3) item { TextButton(onClick = model::choices, enabled = !state.busy) { Text("重新生成行动建议") } }
    }
}

@Composable
private fun MapPanel(state: GameUiState, model: GameViewModel) {
    val game = state.game ?: return
    val map = game.obj("map")
    var selected by rememberSaveable { mutableStateOf("") }
    var cell by remember { mutableStateOf<JSONObject?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    val locations = map.array("locations").objects()
    val chosen = locations.find { it.text("id") == selected }
    Page("贝克兰德地图") {
        Text("拖动与双指缩放地图，点选街区或已知地点。", fontSize = 13.sp)
        HexMap(map, game.obj("location").text("id"), selected) { clicked ->
            cell = clicked
            selected = clicked.obj("tile").text("locationId")
        }
        chosen?.let { location ->
            val status = location.obj("knowledge").text("status")
            CardBlock(location.text("name"), location.text("description")) {
                Text("${location.text("district")} · ${if (status == "rumored") "尚待核实的传闻" else "已知地点"}", fontSize = 13.sp)
                if (status == "rumored") Button(onClick = { model.action("根据地图上的传闻，调查${location.obj("knowledge").text("note", location.text("rumor"))}。", JSONObject().put("mapInvestigation", JSONObject().put("locationId", location.text("id")).put("currentStatus", status).put("rumor", location.text("rumor")))) }, enabled = !state.busy) { Text("调查传闻") }
                else Button(onClick = { model.action("前往${location.text("name")}", JSONObject().put("mapDestination", location)) }, enabled = !state.busy && location.text("id") != game.obj("location").text("id")) { Text("前往此地") }
            }
        }
        if (chosen == null && cell?.optBoolean("explorable") == true) Button(onClick = { cell?.let { model.explore(it.optInt("q"), it.optInt("r")) } }, enabled = !state.busy) { Text("探索相邻街区 · 约13分钟") }
        if (game.obj("prayer").optBoolean("ok")) Button(onClick = model::pray, enabled = !state.busy) { Text("在这里祷告 · 恢复理智与灵性") }
        OutlinedTextField(query, { query = it }, label = { Text("查找已知地点") }, modifier = Modifier.fillMaxWidth())
        locations.filter { query.isBlank() || it.text("name").contains(query) || it.text("district").contains(query) }.forEach { location ->
            TextButton(onClick = { selected = location.text("id") }, modifier = Modifier.fillMaxWidth()) { Text("${location.text("name")} · ${if (location.obj("knowledge").text("status") == "rumored") "传闻" else "已知"}", Modifier.fillMaxWidth()) }
        }
        OutlinedButton(onClick = { model.panel("special") }) { Text("打开特殊行动") }
    }
}

@Composable
private fun HexMap(map: JSONObject, currentId: String, selected: String, onCell: (JSONObject) -> Unit) {
    var zoom by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }
    val cells = map.array("cells").objects()
    val qMin = cells.minOfOrNull { it.optInt("q") } ?: 0
    val qMax = cells.maxOfOrNull { it.optInt("q") } ?: 1
    val rMin = cells.minOfOrNull { it.optInt("r") } ?: 0
    val rMax = cells.maxOfOrNull { it.optInt("r") } ?: 1
    fun point(cell: JSONObject, width: Float, height: Float): Offset {
        val radius = minOf(width / ((qMax - qMin + 2) * 1.75f), height / ((rMax - rMin + 2) * 1.5f)) * zoom
        val q = cell.optInt("q") - (qMin + qMax) / 2f
        val r = cell.optInt("r") - (rMin + rMax) / 2f
        return Offset(width / 2 + radius * sqrt(3f) * (q + r / 2), height / 2 + radius * 1.5f * r) + pan
    }
    Canvas(Modifier.fillMaxWidth().height(360.dp).background(Color(0xFF253F34)).semantics { contentDescription = "贝克兰德六边形地图，支持缩放和点选" }
        .pointerInput(map) { detectTransformGestures { _, move, scale, _ -> zoom = (zoom * scale).coerceIn(.6f, 4f); pan += move } }
        .pointerInput(map, zoom, pan) { detectTapGestures { touch -> cells.minByOrNull { (point(it, size.width.toFloat(), size.height.toFloat()) - touch).getDistance() }?.let(onCell) } }) {
        val radius = minOf(size.width / ((qMax - qMin + 2) * 1.75f), size.height / ((rMax - rMin + 2) * 1.5f)) * zoom
        cells.forEach { cell ->
            val center = point(cell, size.width, size.height)
            val path = Path()
            for (i in 0..5) { val angle = (Math.PI / 180 * (60 * i - 30)).toFloat(); val x = center.x + radius * cos(angle); val y = center.y + radius * sin(angle); if (i == 0) path.moveTo(x, y) else path.lineTo(x, y) }
            path.close()
            val tile = cell.obj("tile")
            val color = if (!cell.optBoolean("discovered")) Color(0xFF20322A) else when (tile.text("terrain")) { "river" -> Color(0xFF43717A); "bridge" -> Brass; "park" -> Color(0xFF648B58); else -> Color(0xFF536E51) }
            drawPath(path, color)
            drawPath(path, Color(0xFF91A17A).copy(alpha = .5f), style = Stroke(1f))
            val locationId = tile.text("locationId")
            if (locationId.isNotBlank() && cell.optBoolean("discovered")) drawCircle(if (locationId == currentId) Color(0xFFF9DE9E) else if (locationId == selected) Color.White else Brass, radius * .24f, center)
            if (cell.optBoolean("explorable")) drawPath(path, Color(0xFFE2C28A), style = Stroke(2f))
        }
    }
}

@Composable
private fun QuestPanel(state: GameUiState, model: GameViewModel) {
    val game = state.game ?: return
    var filter by rememberSaveable { mutableStateOf("active") }
    Page("任务与委托") {
        Chips(listOf("active" to "进行中", "issued" to "我发布的委托", "opportunities" to "可接机会", "archive" to "归档"), filter) { filter = it }
        val tasks = game.obj("journal").array(filter).objects()
        if (tasks.isEmpty()) Text("这里暂时没有记录。")
        tasks.forEach { task ->
            CardBlock(task.text("title"), task.text("objective", task.text("description"))) {
                Text("${task.text("status")} · ${task.text("stageLabel", task.text("currentObjective"))}", fontSize = 13.sp)
                val commission = task.optJSONObject("commission")
                if (commission != null) {
                    Text("受托人：${commission.text("executorName")} · ${commission.text("label")}")
                    Text("费用：${commission.optInt("feePence")}便士 · ${if (commission.optBoolean("feePaid")) "已支付" else "未支付"}", fontSize = 13.sp)
                    if (commission.text("dueAt").isNotBlank()) Text("交付时间：${commission.text("dueAt")}", fontSize = 13.sp)
                    LinearProgressIndicator(progress = { commission.optInt("progress") / 100f }, modifier = Modifier.fillMaxWidth())
                    commission.optJSONObject("report")?.let { report ->
                        Text("调查报告", fontWeight = FontWeight.Bold); Text(report.text("summary"))
                        report.array("clues").objects().forEach { clue -> Text("• ${clue.text("title")}\n${clue.text("detail")}") }
                    }
                    commission.array("history").objects().takeLast(6).forEach { Text("${it.text("worldTime")} · ${it.text("note")}", fontSize = 12.sp) }
                    val operations = when (commission.text("phase")) { "offered" -> listOf("accept" to "确认报价并付款", "cancel" to "取消委托"); "investigating" -> listOf("check" to "当面询问", "cancel" to "取消委托（不退款）"); "ready" -> listOf("collect" to "领取调查报告"); else -> emptyList() }
                    operations.forEach { (operation, label) -> OutlinedButton(onClick = { model.action(label, JSONObject().put("questTrackingRequest", JSONObject().put("id", task.text("id")).put("revision", task.get("revision")).put("routeId", "commission:$operation"))) }, enabled = !state.busy) { Text(label) } }
                }
                TextButton(onClick = { model.focus(task.text("id")) }, enabled = !state.busy) { Text(if (task.text("id") == game.text("trackedQuestId")) "正在追踪" else "设为追踪任务") }
                if (commission == null && filter != "archive") {
                    val assistance = task.obj("assistance")
                    if (assistance.text("reason").isNotBlank()) Text(assistance.text("reason"), fontSize = 13.sp)
                    val routes = assistance.array("routes").objects()
                    routes.forEach { route -> OutlinedButton(onClick = { model.action(route.text("label", "继续任务"), JSONObject().put("questTrackingRequest", JSONObject().put("id", task.text("id")).put("revision", task.get("revision")).put("routeId", route.text("id")))) }, enabled = !state.busy) { Text(route.text("label", route.text("description"))) } }
                    if (routes.isEmpty()) Button(onClick = { model.action("继续追踪任务「${task.text("title")}」", JSONObject().put("questTrackingRequest", JSONObject().put("id", task.text("id")).put("revision", task.get("revision")))) }, enabled = !state.busy) { Text("继续任务") }
                }
            }
        }
    }
}

@Composable
private fun InventoryPanel(state: GameUiState, model: GameViewModel) {
    val game = state.game ?: return
    var query by rememberSaveable { mutableStateOf("") }
    Page("随身行囊") {
        Text("负重上限 ${game.obj("capacity").optDouble("maxWeight")}kg · 所有物品变化由本地规则核验。", fontSize = 13.sp)
        OutlinedTextField(query, { query = it }, label = { Text("查找物品") }, modifier = Modifier.fillMaxWidth())
        game.array("inventory").objects().filter { it.text("name").contains(query) }.forEach { item ->
            CardBlock("${item.text("name")} ×${item.optInt("quantity", 1)}", item.text("discoveredInfo", item.text("description"))) {
                Text("${item.text("category")} · ${item.text("condition")} · ${if (item.optBoolean("equipped")) "已装备" else "未装备"}", fontSize = 13.sp)
                val args = JSONObject().put("instanceId", item.text("instanceId"))
                TextButton(onClick = { model.tool("item.inspect", args, "检查${item.text("name")}") }, enabled = !state.busy) { Text("检查物品") }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { model.tool(if (item.optBoolean("equipped")) "item.unequip" else "item.equip", args, if (item.optBoolean("equipped")) "卸下${item.text("name")}" else "装备${item.text("name")}") }, enabled = !state.busy) { Text(if (item.optBoolean("equipped")) "卸下" else "装备") }
                    OutlinedButton(onClick = { model.tool("item.use", args, "使用${item.text("name")}") }, enabled = !state.busy) { Text("使用") }
                }
            }
        }
    }
}

@Composable
private fun CharacterPanel(state: GameUiState, model: GameViewModel) {
    val game = state.game ?: return
    val character = game.obj("character")
    var target by rememberSaveable { mutableStateOf("") }
    var stacks by rememberSaveable { mutableIntStateOf(0) }
    Page(character.text("name", "角色档案")) {
        Text("${character.text("occupation")} · ${character.optInt("age")}岁 · ${character.obj("advancement").text("pathwayName", "普通人")}")
        listOf("appearance" to "外貌", "personality" to "性格", "desire" to "愿望", "background" to "背景").forEach { (id, label) -> if (character.text(id).isNotBlank()) Text("$label · ${character.text(id)}", lineHeight = 24.sp) }
        game.array("statusEffects").objects().forEach { Text("${it.text("name")} · ${it.text("description")}") }
        val enemies = game.obj("combat").array("enemies").objects().filter { it.optInt("health") > 0 && it.text("status") != "defeated" }
        val targets = enemies.map { it.text("id") to it.text("name") }
        if (targets.isNotEmpty()) {
            Text("当前战斗")
            Chips(targets, target) { target = it }
            enemies.forEach { Text("${it.text("name")} · 生命${it.optInt("health")}/${it.optInt("maxHealth")}") }
            listOf("attack" to "普通攻击", "defend" to "防御", "wait" to "观察敌人").forEach { (id, label) -> Button(onClick = { model.action(label, JSONObject().put("combatRequest", JSONObject().put("actionId", id).put("enemyId", target.ifBlank { enemies.first().text("id") }).put("boostStacks", if (id == "attack") stacks else 0))) }, enabled = !state.busy) { Text(label) } }
        }
        val abilities = character.obj("advancement").array("unlockedAbilities").objects()
        if (abilities.any { it.obj("rule").has("preparation") }) {
            Text("狼人强化层数")
            Chips((0..3).map { it.toString() to "$it 层" }, stacks.toString()) { stacks = it.toInt() }
        }
        abilities.forEach { ability -> CardBlock(ability.text("name"), ability.text("description")) {
            val passive = ability.text("kind") == "passive"
            val kind = ability.obj("target").text("kind", ability.obj("rule").obj("target").text("kind"))
            var chosenTarget by rememberSaveable(ability.text("id")) { mutableStateOf("") }
            val possible = if (kind == "enemy") targets else if (kind == "clue") game.array("knownClues").objects().map { it.text("id") to it.text("title") } else emptyList()
            val effectiveTarget = if (possible.size == 1) possible.first().first else chosenTarget
            Text(if (passive) "被动生效 · 相关检定自动核验" else "灵性消耗 ${ability.optInt("spiritualityCost")} · 1回合", fontSize = 13.sp)
            if (!passive) {
                if (possible.isNotEmpty()) Chips(possible, effectiveTarget) { chosenTarget = it }
                Button(onClick = { model.action("使用${ability.text("name")}${if (effectiveTarget.isNotBlank()) "，目标是${possible.find { it.first == effectiveTarget }?.second}" else ""}", JSONObject().put("abilityRequest", JSONObject().put("abilityId", ability.text("id")).put("boostStacks", stacks).apply { if (effectiveTarget.isNotBlank()) put("targetId", effectiveTarget) })) }, enabled = !state.busy) { Text("使用能力") }
            }
        } }
    }
}

@Composable
private fun SpecialPanel(state: GameUiState, model: GameViewModel) {
    val game = state.game ?: return
    var tab by rememberSaveable { mutableStateOf("work") }
    var hours by rememberSaveable { mutableIntStateOf(1) }
    var inquiry by rememberSaveable { mutableStateOf("") }
    val special = game.obj("special")
    Page("日常与非凡") {
        Chips(listOf("work" to "委托", "people" to "人物", "supplies" to "补给", "craft" to "制作", "organization" to "组织", "wait" to "等待"), tab) { tab = it }
        if (tab == "wait") {
            Text("等待 ${hours} 小时")
            Slider(hours.toFloat(), { hours = it.toInt() }, valueRange = 1f..24f, steps = 22, enabled = !state.busy)
            Text("等待会推进游戏时间，委托、持续状态和世界事件照常结算。", fontSize = 13.sp)
            Button(onClick = { model.special(JSONObject().put("operation", "wait").put("hours", hours).put("revision", special.optInt("revision")).put("expectedTurn", game.optInt("turn")).put("expectedWorldTime", game.text("worldTime"))) }, enabled = !state.busy) { Text("确认等待${hours}小时") }
        } else special.array(tab).objects().forEach { card ->
            CardBlock(card.text("title", card.text("name")), card.text("description")) {
                card.array("actions").objects().forEach { action ->
                    Button(onClick = { model.special(action.obj("request")) }, enabled = !state.busy && action.text("disabledReason").isBlank()) { Text(action.text("label")) }
                    if (action.text("disabledReason").isNotBlank()) Text(action.text("disabledReason"), fontSize = 12.sp)
                }
                if (tab == "people") {
                    card.array("topics").objects().forEach { topic -> OutlinedButton(onClick = { model.action(topic.text("action"), JSONObject().put("personConversation", card.text("id"))) }, enabled = !state.busy && card.text("conversationReason").isBlank()) { Text(topic.text("label")) } }
                    if (card.text("id") == "sherlock-moriarty") {
                        OutlinedTextField(inquiry, { inquiry = it }, label = { Text("希望委托夏洛克调查什么？") }, modifier = Modifier.fillMaxWidth())
                        Button(onClick = { model.action("我想委托夏洛克调查：$inquiry", JSONObject().put("personConversation", card.text("id"))) }, enabled = !state.busy && inquiry.isNotBlank() && card.text("conversationReason").isBlank()) { Text("商议调查委托") }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotesPanel(state: GameUiState) {
    val game = state.game ?: return
    Page("调查手记") {
        CardBlock("已确认线索") { game.array("knownClues").objects().forEach { clue -> Text("${clue.text("title")}\n${clue.text("detail", clue.text("description"))}", lineHeight = 24.sp) } }
        CardBlock("人物档案") { game.array("relationships").objects().forEach { person -> Text("${person.text("name")} · ${person.text("description", person.text("note"))}", lineHeight = 24.sp) } }
        CardBlock("回合摘要") { game.array("changeLog").objects().takeLast(20).reversed().forEach { Text("第${it.optInt("turn")}轮 · ${it.text("text")}", fontSize = 13.sp) } }
        CardBlock("世界消息") { game.array("worldEvents").objects().takeLast(20).reversed().forEach { Text(it.text("text"), fontSize = 13.sp) } }
        CardBlock("故事记忆", game.text("longTermSummary"))
    }
}

@Composable
private fun SettingsPanel(state: GameUiState, model: GameViewModel) {
    var settingsJson by rememberSaveable(state.ready) { mutableStateOf(state.settings.toString()) }
    var key by remember { mutableStateOf(model.apiKey) }
    var prompt by rememberSaveable(state.ready) { mutableStateOf(state.prompt) }
    val settings = JSONObject(settingsJson)
    fun update(id: String, value: Any) { settingsJson = JSONObject(settingsJson).put(id, value).toString() }
    Page("API与阅读设置") {
        listOf("baseUrl" to "API地址", "model" to "模型名称").forEach { (id, label) -> OutlinedTextField(settings.text(id), { update(id, it) }, modifier = Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true) }
        Text("服务商")
        Chips(listOf("openai" to "OpenAI兼容", "deepseek" to "DeepSeek", "custom" to "自定义"), settings.text("provider")) { update("provider", it) }
        OutlinedTextField(key, { key = it }, label = { Text("API密钥") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        listOf("persistKey" to "加密保存密钥", "nativeTools" to "使用工具调用", "stream" to "流式显示剧情", "readingDark" to "夜读外观").forEach { (id, label) -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text(label, Modifier.weight(1f)); Switch(settings.optBoolean(id), { update(id, it) }) } }
        Text("密钥与存档分开保存，启用持久化时由Android Keystore加密。", fontSize = 12.sp)
        listOf("temperature" to "温度", "maxTokens" to "最大输出预算", "contextLength" to "上下文长度").forEach { (id, label) ->
            OutlinedTextField(settings.text(id), { value -> update(id, if (id == "temperature") value.toDoubleOrNull() ?: 1.0 else value.toIntOrNull() ?: 4096) }, label = { Text(label) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
        }
        Text("输出预算模式")
        Chips(listOf("auto" to "自动", "manual" to "手动"), settings.text("maxTokensMode")) { update("maxTokensMode", it) }
        Text("推理模式")
        Chips(listOf("auto" to "自动", "off" to "关闭", "low" to "低", "medium" to "中", "high" to "高"), settings.text("reasoningMode")) { update("reasoningMode", it) }
        OutlinedTextField(settings.text("customHeaders", "{}"), { update("customHeaders", it) }, label = { Text("自定义请求头（JSON）") }, modifier = Modifier.fillMaxWidth())
        Text("正文字号 ${settings.optInt("readingFontSize", 18)}")
        Slider(settings.optInt("readingFontSize", 18).toFloat(), { update("readingFontSize", it.toInt()) }, valueRange = 16f..22f, steps = 5)
        OutlinedTextField(prompt, { prompt = it }, label = { Text("叙事提示词") }, modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp), minLines = 5, maxLines = 12)
        TextButton(onClick = { prompt = state.catalog.text("defaultPrompt") }) { Text("恢复默认提示词") }
        Button(onClick = { model.saveSettings(settings, key, prompt) }, enabled = !state.busy) { Text("保存设置") }
        TextButton(onClick = { model.panel(if (state.game == null) "home" else "menu") }) { Text("返回") }
    }
}

@Composable
private fun SavePanel(state: GameUiState, model: GameViewModel, onImport: () -> Unit, onExport: () -> Unit) = Page("存档柜") {
    state.saves.forEachIndexed { slot, label -> CardBlock(if (slot == 0) "自动存档" else "手动存档 $slot", label) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { model.load(slot) }, enabled = !state.busy && label != "空存档") { Text("载入") }
            if (slot != 0) OutlinedButton(onClick = { model.save(slot) }, enabled = !state.busy && state.game != null) { Text(if (label == "空存档") "保存" else "覆盖保存") }
            if (slot != 0 && label != "空存档") TextButton(onClick = { model.delete(slot) }, enabled = !state.busy) { Text("删除") }
        }
    } }
    Button(onClick = onImport, enabled = !state.busy) { Text("导入JSON存档") }
    OutlinedButton(onClick = onExport, enabled = !state.busy && state.game != null) { Text("导出当前进度") }
    Text("存档可在网页版和原生版之间迁移，API设置与密钥不会写入导出文件。", fontSize = 13.sp)
    TextButton(onClick = { model.panel(if (state.game == null) "home" else "menu") }) { Text("返回") }
}

@Composable
private fun MenuPanel(state: GameUiState, model: GameViewModel, onImport: () -> Unit, onExport: () -> Unit) {
    val context = LocalContext.current
    Page("游戏菜单") {
        listOf("special" to "特殊行动与人物拜访", "notes" to "调查手记与回合摘要", "saves" to "存档柜", "settings" to "API与阅读设置").forEach { (id, label) -> OutlinedButton(onClick = { model.panel(id) }, modifier = Modifier.fillMaxWidth()) { Text(label) } }
        OutlinedButton(onClick = onImport, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("导入已有存档") }
        OutlinedButton(onClick = onExport, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("导出当前存档") }
        OutlinedButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/Bemyself001/backlund-chronicle/releases"))) }, modifier = Modifier.fillMaxWidth()) { Text("检查APK更新") }
        Text("原生界面随APK更新；网页资源热更新不适用于原生版。", fontSize = 12.sp)
        TextButton(onClick = { model.panel("home") }, enabled = !state.busy) { Text("返回首页") }
        Text("${BuildConfig.VERSION_NAME} · 故事进度已自动保存", fontSize = 12.sp)
    }
}
