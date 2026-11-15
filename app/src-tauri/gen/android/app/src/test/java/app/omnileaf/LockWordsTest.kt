package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

private val HANDED =
    LockWords(
        title = "Omnileaf is locked",
        body = "Unlock to open your library.",
        unlock = "Unlock",
        prompt = "Unlock Omnileaf",
        turnedOff = "App lock was turned off because this phone has no screen lock.",
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
                HANDED.copy(turnedOff = ""),
            ).map { it.isComplete }

        assertEquals(listOf(false, false, false), blanks)
    }

    @Test
    fun `reads back the words it kept`() {
        val kept = LockWords.fromJson(HANDED.toJson())

        assertEquals(HANDED, kept)
    }
}
