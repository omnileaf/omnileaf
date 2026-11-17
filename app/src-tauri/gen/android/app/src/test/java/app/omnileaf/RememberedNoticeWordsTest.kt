package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

private val BUILT_IN =
    UpdateNoticeWords(
        channel = "Updates",
        title = "Omnileaf {version} is available",
        viewRelease = "View release",
        skip = "Skip this version",
    )
private val TRANSLATED =
    UpdateNoticeWords(
        channel = "Aktualisierungen",
        title = "Omnileaf {version} ist verfügbar",
        viewRelease = "Version ansehen",
        skip = "Diese Version überspringen",
    )

class RememberedNoticeWordsTest {
    private val store = MemoryUpdateStore()
    private val words = RememberedNoticeWords(store)

    @Test
    fun `shows the built-in words until the app hands its own`() {
        assertEquals(BUILT_IN, words.toShow { BUILT_IN })
    }

    @Test
    fun `shows the words the app handed last`() {
        words.remember(BUILT_IN)
        words.remember(TRANSLATED)

        assertEquals(TRANSLATED, RememberedNoticeWords(store).toShow { BUILT_IN })
    }

    @Test
    fun `falls back to the built-in words when a remembered line is blank`() {
        words.remember(TRANSLATED.copy(skip = ""))

        assertEquals(BUILT_IN, words.toShow { BUILT_IN })
    }
}
