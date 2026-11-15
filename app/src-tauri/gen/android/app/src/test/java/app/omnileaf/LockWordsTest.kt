package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

private val HANDED =
    LockWords(
        title = "Omnileaf is locked",
        body = "Unlock to open your library.",
        unlock = "Unlock",
        prompt = "Unlock Omnileaf",
        noScreenLock = "Set a screen lock on this phone first",
        noScreenLockBody = "Android needs a PIN, pattern or password before Omnileaf can lock.",
    )

class LockWordsTest {
    @Test
    fun `takes words that fill every line of the lock screen`() {
        assertEquals(true, HANDED.isComplete)
    }

    @Test
    fun `turns down words with a blank line`() {
        val blanks =
            listOf(
                HANDED.copy(title = ""),
                HANDED.copy(prompt = "  "),
                HANDED.copy(noScreenLockBody = ""),
            ).map { it.isComplete }

        assertEquals(listOf(false, false, false), blanks)
    }
}
