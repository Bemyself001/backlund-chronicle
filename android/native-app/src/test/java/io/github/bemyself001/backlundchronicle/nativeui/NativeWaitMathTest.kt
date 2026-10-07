package io.github.bemyself001.backlundchronicle.nativeui

import org.junit.Assert.assertEquals
import org.junit.Test

class NativeWaitMathTest {
    @Test fun aFullDayAndQuarterTurnsHaveDistinctDurationsFromTheCurrentTime() {
        val start = 19f + 20f / 60f
        for (hours in listOf(1, 6, 12, 24)) {
            assertEquals(hours, waitHoursAtAngle((start * 15f + hours * 15f) % 360f, start))
        }
        assertEquals(24, waitHoursAtAngle(start * 15f, start))
        assertEquals(0f, waitClockAngle(0f, -10f), .001f)
        assertEquals(90f, waitClockAngle(10f, 0f), .001f)
        assertEquals(180f, waitClockAngle(0f, 10f), .001f)
        assertEquals(270f, waitClockAngle(-10f, 0f), .001f)
    }

    @Test fun draggingAcrossMidnightDoesNotJumpToTheOppositeEndOfTheRange() {
        assertEquals(7f, waitHoursAfterDrag(6f, 355f, 10f), .001f)
        assertEquals(5f, waitHoursAfterDrag(6f, 10f, 355f), .001f)
        assertEquals(24f, waitHoursAfterDrag(23f, 350f, 5f), .001f)
        assertEquals(24f, waitHoursAfterDrag(24f, 5f, 20f), .001f)
        assertEquals(1f, waitHoursAfterDrag(1f, 10f, 355f), .001f)
    }
}
