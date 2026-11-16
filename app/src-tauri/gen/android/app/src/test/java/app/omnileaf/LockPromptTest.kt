package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class LockPromptTest {
    private val prompt = LockPrompt()

    @Test
    fun `opens once at a time`() {
        val opens = listOf(prompt.open(), prompt.open())

        assertEquals(listOf(true, false), opens)
    }

    @Test
    fun `opens again once closed`() {
        prompt.open()
        prompt.close()

        assertEquals(true, prompt.open())
    }

    @Test
    fun `counts the screen lock's own screen as still in the app`() {
        prompt.open()

        assertEquals(true, prompt.isStillInTheApp(isChangingScreens = false))
    }

    @Test
    fun `counts a rebuilt screen as still in the app`() {
        assertEquals(true, prompt.isStillInTheApp(isChangingScreens = true))
    }

    @Test
    fun `counts leaving with no prompt open as leaving`() {
        assertEquals(false, prompt.isStillInTheApp(isChangingScreens = false))
    }
}
