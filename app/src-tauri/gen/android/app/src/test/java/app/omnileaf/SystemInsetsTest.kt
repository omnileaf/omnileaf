package app.omnileaf

import androidx.core.graphics.Insets
import org.junit.Assert.assertEquals
import org.junit.Test

class SystemInsetsTest {
    @Test
    fun `leaves the system areas whole while the keyboard is closed`() {
        val areas = Insets.of(0, 48, 0, 24)

        val uncovered = areas.aboveKeyboard(Insets.NONE)

        assertEquals(areas, uncovered)
    }

    @Test
    fun `drops the navigation bar the keyboard covers`() {
        val areas = Insets.of(0, 48, 0, 24)

        val uncovered = areas.aboveKeyboard(Insets.of(0, 0, 0, 900))

        assertEquals(Insets.of(0, 48, 0, 0), uncovered)
    }

    @Test
    fun `keeps what a short keyboard leaves of the navigation bar`() {
        val areas = Insets.of(0, 48, 0, 24)

        val uncovered = areas.aboveKeyboard(Insets.of(0, 0, 0, 10))

        assertEquals(Insets.of(0, 48, 0, 14), uncovered)
    }
}
