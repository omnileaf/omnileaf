package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class SystemInsetsTest {
    @Test
    fun `marks the page while the keyboard is shown`() {
        val script = keyboardShownScript(isShown = true)

        assertEquals("document.documentElement.toggleAttribute('data-keyboard-shown',true);", script)
    }

    @Test
    fun `clears the mark once the keyboard is hidden`() {
        val script = keyboardShownScript(isShown = false)

        assertEquals("document.documentElement.toggleAttribute('data-keyboard-shown',false);", script)
    }
}
