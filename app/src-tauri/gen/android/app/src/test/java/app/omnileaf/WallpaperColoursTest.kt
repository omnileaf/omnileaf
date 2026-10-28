package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import android.R.color as system

private const val RGB = 0xFFFFFF

private fun shown(
    light: Int,
    dark: Int,
) = ThemedColour(light and RGB, dark and RGB)

class WallpaperColoursTest {
    private val resourceAsColour = ColourResources { resource -> resource }

    @Test
    fun `takes Android 14's own colour roles`() {
        val scheme = wallpaperScheme(roleColours(), resourceAsColour)

        assertEquals(
            shown(system.system_primary_light, system.system_primary_dark),
            scheme.roles[SchemeRole.PRIMARY],
        )
        assertEquals(
            shown(system.system_surface_container_low_light, system.system_surface_container_low_dark),
            scheme.roles[SchemeRole.SURFACE_CONTAINER_LOW],
        )
    }

    @Test
    fun `picks Android 12's palette tones for each role`() {
        val scheme = wallpaperScheme(paletteTones(), resourceAsColour)

        assertEquals(
            shown(system.system_accent1_600, system.system_accent1_200),
            scheme.roles[SchemeRole.PRIMARY],
        )
        assertEquals(
            shown(system.system_neutral2_500, system.system_neutral2_400),
            scheme.roles[SchemeRole.OUTLINE],
        )
    }

    @Test
    fun `gives every role a colour from Android's palettes or from its roles`() {
        val roles = listOf(paletteTones(), roleColours() + inverseRoleColours()).map { it.keys }

        assertEquals(listOf(SchemeRole.entries.toSet(), SchemeRole.entries.toSet()), roles)
    }

    @Test
    fun `keeps only the red, green and blue of each colour`() {
        val scheme = wallpaperScheme(paletteTones()) { 0x80123456.toInt() }

        assertEquals(ThemedColour(0x123456, 0x123456), scheme.roles[SchemeRole.ON_SURFACE])
    }
}
