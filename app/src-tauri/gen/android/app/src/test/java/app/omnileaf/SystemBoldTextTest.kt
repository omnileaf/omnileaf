package app.omnileaf

import android.content.res.Configuration
import org.junit.Assert.assertEquals
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

    @Test
    fun `tells the page the Bold text it starts with`() {
        val told = mutableListOf<Boolean>()

        BoldTextChanges(told::add).follow(0)

        assertEquals(listOf(false), told)
    }

    @Test
    fun `tells the page each time Bold text turns on or off`() {
        val told = mutableListOf<Boolean>()
        val changes = BoldTextChanges(told::add)

        listOf(0, BOLD_TEXT_ADJUSTMENT, 0).forEach(changes::follow)

        assertEquals(listOf(false, true, false), told)
    }

    @Test
    fun `tells the page nothing when another setting changes the configuration`() {
        val told = mutableListOf<Boolean>()
        val changes = BoldTextChanges(told::add)

        listOf(BOLD_TEXT_ADJUSTMENT, BOLD_TEXT_ADJUSTMENT).forEach(changes::follow)

        assertEquals(listOf(true), told)
    }
}
