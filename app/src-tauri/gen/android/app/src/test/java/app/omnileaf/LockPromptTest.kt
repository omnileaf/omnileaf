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

    @Test
    fun `asks once focus arrives after waiting for it`() {
        prompt.waitForFocus()

        assertEquals(true, prompt.focusArrived())
    }

    @Test
    fun `asks only once for each wait`() {
        prompt.waitForFocus()

        val asks = listOf(prompt.focusArrived(), prompt.focusArrived())

        assertEquals(listOf(true, false), asks)
    }

    @Test
    fun `does not ask on focus it was not waiting for`() {
        assertEquals(false, prompt.focusArrived())
    }

    @Test
    fun `does not wait for focus while the prompt is already open`() {
        prompt.open()

        prompt.waitForFocus()

        assertEquals(false, prompt.focusArrived())
    }
}
