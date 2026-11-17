package app.omnileaf

import android.content.pm.ActivityInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CoverRedrawTest {
    @Test
    fun `redraws the cover for a change to its text size, density, theme or language`() {
        val drawnChanges =
            listOf(
                ActivityInfo.CONFIG_FONT_SCALE,
                ActivityInfo.CONFIG_DENSITY,
                ActivityInfo.CONFIG_UI_MODE,
                ActivityInfo.CONFIG_LOCALE,
            )

        val redraws = drawnChanges.map(::changesWhatTheCoverDraws)

        assertEquals(listOf(true, true, true, true), redraws)
    }

    @Test
    fun `keeps the cover, and its focus, when the screen turns or a keyboard comes and goes`() {
        val keptChanges =
            listOf(
                ActivityInfo.CONFIG_ORIENTATION or ActivityInfo.CONFIG_SCREEN_SIZE,
                ActivityInfo.CONFIG_KEYBOARD or ActivityInfo.CONFIG_KEYBOARD_HIDDEN,
            )

        val redraws = keptChanges.map(::changesWhatTheCoverDraws)

        assertEquals(listOf(false, false), redraws)
    }

    @Test
    fun `redraws the cover when a change it draws comes with one it does not`() {
        assertTrue(changesWhatTheCoverDraws(ActivityInfo.CONFIG_ORIENTATION or ActivityInfo.CONFIG_FONT_SCALE))
    }
}
