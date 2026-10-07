package io.github.bemyself001.backlundchronicle.nativeui

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun NativeWaitSheet(game: JSONObject, busy: Boolean, onConfirm: (Int) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        NativeWaitSelector(game, busy, onConfirm, onDismiss, Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp).testTag("wait-sheet"))
    }
}

@Composable
internal fun NativeWaitSelector(game: JSONObject, busy: Boolean, onConfirm: (Int) -> Unit, onCancel: () -> Unit, modifier: Modifier = Modifier) {
    var hours by rememberSaveable(game.optInt("turn"), game.text("worldTime")) { mutableIntStateOf(1) }
    val quickWait = game.obj("quickWait")
    val preview = quickWait.array("previews").optJSONObject(hours - 1)
    val reason = if (busy) "本轮正在处理中…" else quickWait.text("disabledReason").ifBlank { if (preview == null) "等待预览暂不可用" else "" }
    val enabled = reason.isBlank()
    val colors = MaterialTheme.colorScheme
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("跳过时间", style = MaterialTheme.typography.headlineSmall, color = colors.primary, modifier = Modifier.weight(1f).semantics { heading() })
            Text("一圈 · 24小时", style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            TextButton(onClick = onCancel, modifier = Modifier.testTag("wait-cancel"), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)) { Text("取消") }
        }
        Text("拨动圆钟，选择想抵达的时刻。", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, modifier = Modifier.fillMaxWidth())
        WaitClock(hours, preview, enabled, { hours = it.coerceIn(1, 24) }, Modifier.widthIn(max = 250.dp).fillMaxWidth().aspectRatio(1f))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { hours = (hours - 1).coerceAtLeast(1) }, enabled = enabled && hours > 1, modifier = Modifier.size(44.dp).testTag("wait-decrease").semantics { contentDescription = "减少1小时" }, contentPadding = PaddingValues(0.dp)) { Text("−", fontSize = 22.sp) }
            listOf(1, 6, 12, 24).forEach { value ->
                val selected = hours == value
                OutlinedButton(
                    onClick = { hours = value }, enabled = enabled, modifier = Modifier.weight(1f).heightIn(min = 44.dp).testTag("wait-preset-$value").semantics { this.selected = selected },
                    shape = MaterialTheme.shapes.small,
                    colors = ButtonDefaults.outlinedButtonColors(containerColor = if (selected) colors.secondaryContainer else colors.surface, contentColor = if (selected) colors.onSecondaryContainer else colors.onSurface),
                    contentPadding = PaddingValues(horizontal = 1.dp, vertical = 8.dp),
                ) { Text("${value}h", fontSize = 12.sp) }
            }
            TextButton(onClick = { hours = (hours + 1).coerceAtMost(24) }, enabled = enabled && hours < 24, modifier = Modifier.size(44.dp).testTag("wait-increase").semantics { contentDescription = "增加1小时" }, contentPadding = PaddingValues(0.dp)) { Text("＋", fontSize = 22.sp) }
        }
        preview?.let {
            HorizontalDivider(color = colors.outlineVariant)
            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                WaitTimePoint("现在", preview.text("startClock"), preview.text("startDate"), Modifier.weight(1f))
                Text("→", color = colors.secondary, modifier = Modifier.padding(horizontal = 12.dp))
                WaitTimePoint("抵达 · ${preview.text("dayLabel")}", preview.text("endClock"), preview.text("endDate"), Modifier.weight(1f).testTag("wait-arrival"))
            }
        }
        if (reason.isNotBlank()) Text(reason, color = colors.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth().testTag("wait-disabled-reason").semantics { liveRegion = LiveRegionMode.Polite })
        ChronicleButton(onClick = { if (enabled) onConfirm(hours) }, enabled = enabled, modifier = Modifier.fillMaxWidth().testTag("wait-confirm")) { Text("确认等待 ${hours} 小时") }
        Text("推进1回合，持续状态与任务照常结算。等待本身不会恢复生命或理智。", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
    }
}

@Composable
private fun WaitTimePoint(label: String, clock: String, date: String, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(clock, style = MaterialTheme.typography.titleLarge, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurface)
        Text(date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun WaitClock(hours: Int, preview: JSONObject?, enabled: Boolean, onHours: (Int) -> Unit, modifier: Modifier) {
    val colors = MaterialTheme.colorScheme
    val startHours = preview?.optDouble("startHours")?.toFloat() ?: 0f
    val currentHours = rememberUpdatedState(hours)
    val changeHours = rememberUpdatedState(onHours)
    val labelPaint = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = Typeface.MONOSPACE } }
    Box(modifier
        .testTag("wait-dial")
        .semantics(mergeDescendants = true) {
            contentDescription = "等待时长"
            progressBarRangeInfo = ProgressBarRangeInfo(hours.toFloat(), 1f..24f, 22)
            stateDescription = if (preview == null) "${hours}小时" else "等待${hours}小时，${preview.text("dayLabel")}${preview.text("endClock")}结束"
            if (!enabled) disabled()
            setProgress { target -> if (!enabled) false else { changeHours.value(target.roundToInt().coerceIn(1, 24)); true } }
        }
        .onKeyEvent { event ->
            if (!enabled || event.type != KeyEventType.KeyDown) false else {
                val delta = when (event.key) { Key.DirectionRight, Key.DirectionUp -> 1; Key.DirectionLeft, Key.DirectionDown -> -1; Key.PageUp -> 6; Key.PageDown -> -6; else -> 0 }
                if (delta == 0) false else { changeHours.value((currentHours.value + delta).coerceIn(1, 24)); true }
            }
        }
        .focusable(enabled)
        .pointerInput(enabled, startHours) {
            if (!enabled) return@pointerInput
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                fun angle(position: Offset): Float? {
                    val x = position.x - size.width / 2f; val y = position.y - size.height / 2f
                    return if (hypot(x, y) < size.width * .25f) null else waitClockAngle(x, y)
                }
                val firstAngle = angle(down.position) ?: return@awaitEachGesture
                val original = currentHours.value
                var rawHours = waitHoursAtAngle(firstAngle, startHours).toFloat()
                var lastAngle = firstAngle
                changeHours.value(rawHours.roundToInt())
                down.consume()
                var completed = false
                try {
                    completed = drag(down.id) { change ->
                        angle(change.position)?.let { nextAngle ->
                            rawHours = waitHoursAfterDrag(rawHours, lastAngle, nextAngle)
                            lastAngle = nextAngle
                            changeHours.value(rawHours.roundToInt())
                        }
                        change.consume()
                    }
                } finally {
                    if (!completed) changeHours.value(original)
                }
            }
        }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val center = Offset(size.width / 2f, size.height / 2f)
            val radius = size.minDimension * .365f
            fun point(degrees: Float, distance: Float): Offset {
                val radians = Math.toRadians(degrees.toDouble())
                return center + Offset(sin(radians).toFloat() * distance, -cos(radians).toFloat() * distance)
            }
            val gold = colors.secondary.copy(alpha = if (enabled) 1f else .4f)
            drawCircle(colors.background, radius * .88f, center)
            drawCircle(colors.outlineVariant, radius, center, style = Stroke(7.dp.toPx()))
            val startAngle = startHours * 15f
            drawArc(gold, startAngle - 90f, hours * 15f, false, center - Offset(radius, radius), Size(radius * 2, radius * 2), style = Stroke(7.dp.toPx(), cap = StrokeCap.Round))
            for (hour in 0..23) {
                val major = hour % 6 == 0
                drawLine(if (major) colors.secondary else colors.outline, point(hour * 15f, size.minDimension * if (major) .407f else .42f), point(hour * 15f, size.minDimension * .436f), if (major) 2.dp.toPx() else 1.dp.toPx())
            }
            labelPaint.color = colors.onSurfaceVariant.toArgb(); labelPaint.textSize = 11.sp.toPx()
            for (hour in listOf(0, 6, 12, 18)) {
                val p = point(hour * 15f, size.minDimension * .475f)
                drawContext.canvas.nativeCanvas.drawText("%02d".format(hour), p.x, p.y - (labelPaint.ascent() + labelPaint.descent()) / 2f, labelPaint)
            }
            val start = point(startAngle, radius); val end = point(startAngle + hours * 15f, radius)
            drawLine(gold.copy(alpha = .4f), center, end, 1.dp.toPx())
            drawCircle(colors.background, radius * .78f, center)
            drawCircle(ChronicleVitals.sanity, 4.dp.toPx(), start)
            drawCircle(gold.copy(alpha = .14f), 15.dp.toPx(), end)
            drawCircle(gold, 9.dp.toPx(), end)
            drawCircle(colors.surface, 2.dp.toPx(), end)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.clearAndSetSemantics { }) {
            Text("等待时长", style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(hours.toString(), fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 43.sp, color = colors.onSurface)
                Text(" 小时", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, modifier = Modifier.padding(bottom = 8.dp))
            }
            Text("${preview?.text("phase") ?: "—"}抵达", style = MaterialTheme.typography.labelSmall, color = colors.secondary)
        }
    }
}
