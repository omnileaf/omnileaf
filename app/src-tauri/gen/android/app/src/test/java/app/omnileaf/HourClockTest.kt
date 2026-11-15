package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class HourClockTest {
    @Test
    fun `names a 24-hour clock`() {
        assertEquals("twentyFourHour", HourClock.of(isTwentyFourHour = true).id)
    }

    @Test
    fun `names a 12-hour clock`() {
        assertEquals("twelveHour", HourClock.of(isTwentyFourHour = false).id)
    }
}
