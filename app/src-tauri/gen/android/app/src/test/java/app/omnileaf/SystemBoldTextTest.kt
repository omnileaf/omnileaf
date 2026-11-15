package app.omnileaf

import android.content.res.Configuration
import org.junit.Assert.assertEquals
import org.junit.Test

private const val BOLD_TEXT_ADJUSTMENT = 300

class SystemBoldTextTest {
    @Test
    fun `reads Android's Bold text from the font weight adjustment it adds`() {
        assertEquals(true, isBoldText(BOLD_TEXT_ADJUSTMENT))
    }

    @Test
    fun `reads no adjustment as plain text`() {
        assertEquals(false, isBoldText(0))
    }

    @Test
    fun `reads an unknown adjustment or none at all as plain text`() {
        val readings = listOf(Configuration.FONT_WEIGHT_ADJUSTMENT_UNDEFINED, null).map(::isBoldText)

        assertEquals(listOf(false, false), readings)
    }
}
