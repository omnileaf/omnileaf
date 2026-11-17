package app.omnileaf

import android.app.UiModeManager
import org.junit.Assert.assertEquals
import org.junit.Test

class StartingThemeTest {
    @Test
    fun `follows the phone's dark mode under System`() {
        val mode = StartingTheme.DEVICE.applicationNightMode()

        assertEquals(UiModeManager.MODE_NIGHT_AUTO, mode)
    }

    @Test
    fun `starts light under Light whatever the phone's dark mode`() {
        val mode = StartingTheme.LIGHT.applicationNightMode()

        assertEquals(UiModeManager.MODE_NIGHT_NO, mode)
    }

    @Test
    fun `starts dark under Dark whatever the phone's dark mode`() {
        val mode = StartingTheme.DARK.applicationNightMode()

        assertEquals(UiModeManager.MODE_NIGHT_YES, mode)
    }
}
