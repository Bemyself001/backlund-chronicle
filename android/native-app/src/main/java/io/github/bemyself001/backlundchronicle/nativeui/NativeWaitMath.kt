package io.github.bemyself001.backlundchronicle.nativeui

import kotlin.math.atan2
import kotlin.math.roundToInt

internal fun waitClockAngle(x: Float, y: Float): Float = ((Math.toDegrees(atan2(x.toDouble(), -y.toDouble())) + 360.0) % 360.0).toFloat()

internal fun waitHoursAtAngle(angle: Float, startHours: Float): Int {
    val delta = ((angle - startHours * 15f) % 360f + 360f) % 360f
    val selected = (delta / 15f).roundToInt()
    return (if (selected == 0) 24 else selected).coerceIn(1, 24)
}

internal fun waitHoursAfterDrag(rawHours: Float, lastAngle: Float, angle: Float): Float {
    val delta = (angle - lastAngle + 540f) % 360f - 180f
    return (rawHours + delta / 15f).coerceIn(1f, 24f)
}
