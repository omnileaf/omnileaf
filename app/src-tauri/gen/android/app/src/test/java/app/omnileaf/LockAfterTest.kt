package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.time.Duration
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes

class LockAfterTest {
    @Test
    fun `reads back every delay from its id`() {
        val read = LockAfter.entries.map { LockAfter.of(it.id) }

        assertEquals(LockAfter.entries, read)
    }

    @Test
    fun `waits a minute when nothing was chosen`() {
        val read = LockAfter.of(null)

        assertEquals(LockAfter.ONE_MINUTE, read)
    }

    @Test
    fun `waits a minute for a delay it doesn't know`() {
        val read = LockAfter.of("twoDays")

        assertEquals(LockAfter.ONE_MINUTE, read)
    }

    @Test
    fun `offers the four times the page shows`() {
        val ids = LockAfter.entries.map { it.id }

        assertEquals(listOf("immediately", "oneMinute", "fiveMinutes", "thirtyMinutes"), ids)
    }

    @Test
    fun `reads a stored 15 minutes as 5 minutes`() {
        val read = LockAfter.of("fifteenMinutes")

        assertEquals(LockAfter.FIVE_MINUTES, read)
    }

    @Test
    fun `reads a stored hour as 30 minutes`() {
        val read = LockAfter.of("oneHour")

        assertEquals(LockAfter.THIRTY_MINUTES, read)
    }

    @Test
    fun `never reads a stored time as a longer one`() {
        val everStored =
            mapOf(
                "immediately" to Duration.ZERO,
                "oneMinute" to 1.minutes,
                "fiveMinutes" to 5.minutes,
                "fifteenMinutes" to 15.minutes,
                "thirtyMinutes" to 30.minutes,
                "oneHour" to 1.hours,
            )

        val readAsLonger = everStored.filter { (id, chosen) -> LockAfter.of(id).delay > chosen }.keys

        assertEquals(emptySet<String>(), readAsLonger)
    }
}
