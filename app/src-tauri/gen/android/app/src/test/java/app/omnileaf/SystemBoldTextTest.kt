package app.omnileaf

import android.content.res.Configuration
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private const val BOLD_TEXT_ADJUSTMENT = 300

class SystemBoldTextTest {
    @Test
    fun `reads Android's Bold text from the font weight adjustment it adds`() {
        assertTrue(isBoldText(BOLD_TEXT_ADJUSTMENT))
    }

    @Test
    fun `reads no adjustment as plain text`() {
        assertFalse(isBoldText(0))
    }

    @Test
    fun `reads an unknown adjustment or none at all as plain text`() {
        assertFalse(isBoldText(Configuration.FONT_WEIGHT_ADJUSTMENT_UNDEFINED))
        assertFalse(isBoldText(null))
    }
}
