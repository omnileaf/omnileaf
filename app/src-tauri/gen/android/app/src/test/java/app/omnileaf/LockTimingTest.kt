package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

class LockTimingTest {
    @Test
    fun `locks a fresh start whatever the delay`() {
        val locks = LockAfter.entries.map { locksOnReturn(it, awayFor = null) }

        assertEquals(List(LockAfter.entries.size) { true }, locks)
    }

    @Test
    fun `locks on every return when set to lock immediately`() {
        val locks = locksOnReturn(LockAfter.IMMEDIATELY, awayFor = 1.seconds)

        assertEquals(true, locks)
    }

    @Test
    fun `stays open after a shorter time away than the delay`() {
        val locks = locksOnReturn(LockAfter.FIVE_MINUTES, awayFor = 4.minutes)

        assertEquals(false, locks)
    }

    @Test
    fun `locks once the time away reaches the delay`() {
        val locks = locksOnReturn(LockAfter.FIVE_MINUTES, awayFor = 5.minutes)

        assertEquals(true, locks)
    }
}
