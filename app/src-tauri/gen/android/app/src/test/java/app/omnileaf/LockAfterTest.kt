package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

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
}
