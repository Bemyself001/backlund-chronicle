package io.github.bemyself001.backlundchronicle.nativeui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

@Composable
internal fun ChronicleButton(
    onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
    content: @Composable RowScope.() -> Unit,
) = Button(onClick, modifier.heightIn(min = 48.dp), enabled, shape = RoundedCornerShape(8.dp), contentPadding = contentPadding, content = content)

@Composable
internal fun ChronicleOutlinedButton(
    onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(horizontal = 14.dp, vertical = 11.dp),
    content: @Composable RowScope.() -> Unit,
) = OutlinedButton(
    onClick, modifier.heightIn(min = 48.dp), enabled, shape = RoundedCornerShape(8.dp),
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
    contentPadding = contentPadding, content = content,
)

@Composable
internal fun ChronicleHeader(game: JSONObject?, onCharacter: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().background(colors.primaryContainer).statusBarsPadding().padding(horizontal = 18.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("贝克兰德纪事", style = MaterialTheme.typography.titleLarge, color = colors.onPrimaryContainer, modifier = Modifier.weight(1f))
            Text(if (game == null) "BACKLUND" else "第${game.optInt("turn")}轮", style = MaterialTheme.typography.labelSmall, color = ChronicleVitals.spirituality)
        }
        game?.let {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(game.obj("location").text("name"), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = colors.onPrimaryContainer, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(game.text("moneyLabel"), style = MaterialTheme.typography.labelSmall, color = ChronicleVitals.spirituality)
            }
            Text(game.text("worldTime"), Modifier.testTag("world-time"), style = MaterialTheme.typography.labelSmall, color = colors.onPrimaryContainer.copy(alpha = .75f))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val stats = game.obj("character").obj("stats")
                ChronicleVital("生命", "health", stats.optInt("health"), stats.optInt("maxHealth"), ChronicleVitals.health, Modifier.weight(1f), onCharacter)
                ChronicleVital("理智", "sanity", stats.optInt("sanity"), stats.optInt("maxSanity"), ChronicleVitals.sanity, Modifier.weight(1f), onCharacter)
                ChronicleVital("灵性", "spirituality", stats.optInt("spirituality"), stats.optInt("maxSpirituality"), ChronicleVitals.spirituality, Modifier.weight(1f), onCharacter)
            }
        }
    }
}

@Composable
private fun ChronicleVital(label: String, id: String, value: Int, maximum: Int, color: Color, modifier: Modifier, onCharacter: () -> Unit) {
    val max = maximum.coerceAtLeast(1)
    val current = value.coerceIn(0, max)
    val low = value <= max * .25f
    Column(modifier.clickable(role = Role.Button, onClick = onCharacter).clearAndSetSemantics {
        testTag = "vital-$id"
        contentDescription = "$label $value/$maximum${if (low) "，偏低" else ""}"
        progressBarRangeInfo = ProgressBarRangeInfo(current.toFloat(), 0f..max.toFloat())
        role = Role.Button
        onClick("打开角色档案") { onCharacter(); true }
    }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(if (low) "$label !" else label, color = color, fontSize = 11.sp, fontWeight = if (low) FontWeight.Bold else FontWeight.Normal)
            Text("$value/$maximum", color = MaterialTheme.colorScheme.onPrimaryContainer, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
        }
        LinearProgressIndicator(progress = { current / max.toFloat() }, modifier = Modifier.fillMaxWidth().height(5.dp), color = color, trackColor = color.copy(alpha = .14f))
    }
}

@Composable
internal fun ChronicleShortcuts(enabled: Boolean, onSpecial: () -> Unit, onWait: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ChronicleOutlinedButton(onSpecial, Modifier.weight(1f).testTag("shortcut-special"), enabled, PaddingValues(horizontal = 10.dp, vertical = 8.dp)) {
            ChronicleSymbol("special", Modifier.size(17.dp)); Spacer(Modifier.width(7.dp)); Text("特殊行动", fontSize = 13.sp)
        }
        ChronicleOutlinedButton(onWait, Modifier.weight(1f).testTag("shortcut-wait"), enabled, PaddingValues(horizontal = 10.dp, vertical = 8.dp)) {
            ChronicleSymbol("clock", Modifier.size(17.dp)); Spacer(Modifier.width(7.dp)); Text("跳过时间", fontSize = 13.sp)
        }
    }
}

@Composable
internal fun ChronicleNavigation(panel: String, onPanel: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column {
        HorizontalDivider(color = colors.outlineVariant)
        Row(Modifier.fillMaxWidth().background(colors.surface)) {
            listOf("story" to "剧情", "map" to "地图", "quests" to "任务", "inventory" to "行囊", "character" to "角色", "menu" to "菜单").forEach { (id, label) ->
                val selected = panel == id
                TextButton(onClick = { onPanel(id) }, modifier = Modifier.weight(1f).heightIn(min = 52.dp).testTag("nav-$id").semantics { this.selected = selected }, shape = RoundedCornerShape(0.dp), contentPadding = PaddingValues(horizontal = 0.dp, vertical = 9.dp)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        ChronicleNavigationSymbol(id, if (selected) colors.primary else colors.onSurfaceVariant, Modifier.size(17.dp))
                        Text(label, fontSize = 12.sp, color = if (selected) colors.primary else colors.onSurfaceVariant, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
                        Box(Modifier.size(width = 18.dp, height = 2.dp).background(if (selected) colors.secondary else Color.Transparent))
                    }
                }
            }
        }
    }
}

@Composable
private fun ChronicleNavigationSymbol(id: String, color: Color, modifier: Modifier) {
    Canvas(modifier) {
        fun p(x: Float, y: Float) = Offset(size.width * x, size.height * y)
        val stroke = 1.25.dp.toPx()
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) = drawLine(color, p(x1, y1), p(x2, y2), stroke)
        val path = Path()
        when (id) {
            "story" -> {
                path.moveTo(size.width * .1f, size.height * .15f); path.lineTo(size.width * .35f, size.height * .1f); path.lineTo(size.width * .5f, size.height * .2f); path.lineTo(size.width * .65f, size.height * .1f); path.lineTo(size.width * .9f, size.height * .15f); path.lineTo(size.width * .9f, size.height * .85f); path.lineTo(size.width * .65f, size.height * .8f); path.lineTo(size.width * .5f, size.height * .9f); path.lineTo(size.width * .35f, size.height * .8f); path.lineTo(size.width * .1f, size.height * .85f); path.close()
                drawPath(path, color, style = Stroke(stroke)); line(.5f, .2f, .5f, .9f)
            }
            "map" -> {
                path.moveTo(size.width * .1f, size.height * .2f); path.lineTo(size.width * .37f, size.height * .1f); path.lineTo(size.width * .63f, size.height * .2f); path.lineTo(size.width * .9f, size.height * .1f); path.lineTo(size.width * .9f, size.height * .8f); path.lineTo(size.width * .63f, size.height * .9f); path.lineTo(size.width * .37f, size.height * .8f); path.lineTo(size.width * .1f, size.height * .9f); path.close()
                drawPath(path, color, style = Stroke(stroke)); line(.37f, .1f, .37f, .8f); line(.63f, .2f, .63f, .9f)
            }
            "quests" -> { drawRect(color, p(.2f, .1f), androidx.compose.ui.geometry.Size(size.width * .6f, size.height * .8f), style = Stroke(stroke)); for (y in listOf(.3f, .5f, .7f)) line(.32f, y, .68f, y) }
            "inventory" -> { drawRect(color, p(.14f, .35f), androidx.compose.ui.geometry.Size(size.width * .72f, size.height * .52f), style = Stroke(stroke)); line(.34f, .35f, .34f, .12f); line(.34f, .12f, .66f, .12f); line(.66f, .12f, .66f, .35f); line(.14f, .55f, .86f, .55f) }
            "character" -> { drawCircle(color, size.minDimension * .15f, p(.5f, .25f), style = Stroke(stroke)); drawArc(color, 180f, 180f, false, p(.16f, .5f), androidx.compose.ui.geometry.Size(size.width * .68f, size.height * .64f), style = Stroke(stroke)); line(.16f, .82f, .84f, .82f) }
            else -> for (y in listOf(.25f, .5f, .75f)) line(.15f, y, .85f, y)
        }
    }
}

@Composable
internal fun ChronicleChoice(index: Int, choice: JSONObject, enabled: Boolean, onChoose: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val risk = when (choice.text("risk")) { "low" -> "低风险"; "medium" -> "中等风险"; "high" -> "高风险"; else -> "" }
    ChronicleOutlinedButton(onChoose, Modifier.fillMaxWidth().testTag("choice-$index"), enabled, PaddingValues(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("%02d".format(index + 1), color = colors.secondary, style = MaterialTheme.typography.titleSmall, fontFamily = FontFamily.Monospace)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(choice.text("label"), color = colors.onSurface, lineHeight = 23.sp)
                if (risk.isNotBlank()) Text(risk, color = if (choice.text("risk") == "high") colors.error else colors.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
            }
            Text("›", color = colors.secondary, fontSize = 23.sp)
        }
    }
}

@Composable
private fun ChronicleSymbol(kind: String, modifier: Modifier) {
    val color = MaterialTheme.colorScheme.secondary
    Canvas(modifier) {
        val center = Offset(size.width / 2, size.height / 2)
        val radius = size.minDimension * .39f
        val stroke = 1.5.dp.toPx()
        if (kind == "clock") {
            drawCircle(color, radius, center, style = Stroke(stroke))
            drawLine(color, center, center + Offset(0f, -radius * .65f), stroke)
            drawLine(color, center, center + Offset(radius * .48f, 0f), stroke)
        } else {
            val path = Path().apply { moveTo(center.x, center.y - radius); lineTo(center.x + radius * .32f, center.y - radius * .32f); lineTo(center.x + radius, center.y); lineTo(center.x + radius * .32f, center.y + radius * .32f); lineTo(center.x, center.y + radius); lineTo(center.x - radius * .32f, center.y + radius * .32f); lineTo(center.x - radius, center.y); lineTo(center.x - radius * .32f, center.y - radius * .32f); close() }
            drawPath(path, color, style = Stroke(stroke))
        }
    }
}
