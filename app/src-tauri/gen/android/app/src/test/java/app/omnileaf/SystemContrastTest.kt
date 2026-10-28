package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class SystemContrastTest {
    @Test
    fun `reads Android's three contrast levels`() {
        val levels = listOf(0f, 0.5f, 1f).map(SystemContrast::of)

        assertEquals(listOf(SystemContrast.STANDARD, SystemContrast.MEDIUM, SystemContrast.HIGH), levels)
    }

    @Test
    fun `reads a contrast below standard as standard`() {
        val level = SystemContrast.of(-0.5f)

        assertEquals(SystemContrast.STANDARD, level)
    }

    @Test
    fun `reads a contrast between two levels as the lower one`() {
        val levels = listOf(0.25f, 0.75f).map(SystemContrast::of)

        assertEquals(listOf(SystemContrast.STANDARD, SystemContrast.MEDIUM), levels)
    }
}
