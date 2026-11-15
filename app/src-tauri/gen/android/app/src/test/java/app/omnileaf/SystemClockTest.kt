package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class SystemClockTest {
    @Test
    fun `names a 24-hour clock`() {
        assertEquals("twentyFourHour", SystemClock.of(isTwentyFourHour = true).id)
    }

    @Test
    fun `names a 12-hour clock`() {
        assertEquals("twelveHour", SystemClock.of(isTwentyFourHour = false).id)
    }
}
