package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

private val HANDED =
    UpdateNoticeWords(
        channel = "Mises à jour",
        title = "Omnileaf {version} est disponible",
        viewRelease = "Voir la version",
        skip = "Ignorer cette version",
    )

class UpdateNoticeWordsTest {
    @Test
    fun `takes words that fill every line of the notice`() {
        assertEquals(true, HANDED.isComplete)
    }

    @Test
    fun `turns down words with a blank line`() {
        val blanks =
            listOf(
                HANDED.copy(channel = ""),
                HANDED.copy(viewRelease = "  "),
                HANDED.copy(skip = ""),
            ).map { it.isComplete }

        assertEquals(listOf(false, false, false), blanks)
    }

    @Test
    fun `turns down a title with no place for the version`() {
        assertEquals(false, HANDED.copy(title = "Omnileaf est disponible").isComplete)
    }

    @Test
    fun `puts the version into the title`() {
        assertEquals("Omnileaf 0.3.0 est disponible", HANDED.titleFor(ReleaseVersion(0, 3, 0)))
    }
}
