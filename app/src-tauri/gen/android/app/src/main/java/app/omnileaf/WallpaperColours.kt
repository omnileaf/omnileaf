package app.omnileaf

import android.os.Build
import androidx.annotation.RequiresApi
import android.R.color as system

internal enum class SchemeRole(
    val id: String,
) {
    PRIMARY("primary"),
    ON_PRIMARY("onPrimary"),
    SECONDARY_CONTAINER("secondaryContainer"),
    ON_SECONDARY_CONTAINER("onSecondaryContainer"),
    TERTIARY_CONTAINER("tertiaryContainer"),
    ON_TERTIARY_CONTAINER("onTertiaryContainer"),
    SURFACE("surface"),
    SURFACE_CONTAINER_LOW("surfaceContainerLow"),
    SURFACE_CONTAINER("surfaceContainer"),
    SURFACE_CONTAINER_HIGHEST("surfaceContainerHighest"),
    ON_SURFACE("onSurface"),
    ON_SURFACE_VARIANT("onSurfaceVariant"),
    OUTLINE("outline"),
    OUTLINE_VARIANT("outlineVariant"),
    INVERSE_SURFACE("inverseSurface"),
    INVERSE_ON_SURFACE("inverseOnSurface"),
    INVERSE_PRIMARY("inversePrimary"),
}

internal data class ThemedColour(
    val light: Int,
    val dark: Int,
)

internal data class WallpaperScheme(
    val roles: Map<SchemeRole, ThemedColour>,
)

internal fun interface ColourResources {
    fun rgb(resource: Int): Int
}

private const val RGB = 0xFFFFFF

internal typealias SchemeResources = Map<SchemeRole, ThemedColour>

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
internal fun roleColours(): SchemeResources =
    mapOf(
        SchemeRole.PRIMARY to ThemedColour(system.system_primary_light, system.system_primary_dark),
        SchemeRole.ON_PRIMARY to ThemedColour(system.system_on_primary_light, system.system_on_primary_dark),
        SchemeRole.SECONDARY_CONTAINER to
            ThemedColour(system.system_secondary_container_light, system.system_secondary_container_dark),
        SchemeRole.ON_SECONDARY_CONTAINER to
            ThemedColour(system.system_on_secondary_container_light, system.system_on_secondary_container_dark),
        SchemeRole.TERTIARY_CONTAINER to
            ThemedColour(system.system_tertiary_container_light, system.system_tertiary_container_dark),
        SchemeRole.ON_TERTIARY_CONTAINER to
            ThemedColour(system.system_on_tertiary_container_light, system.system_on_tertiary_container_dark),
        SchemeRole.SURFACE to ThemedColour(system.system_surface_light, system.system_surface_dark),
        SchemeRole.SURFACE_CONTAINER_LOW to
            ThemedColour(system.system_surface_container_low_light, system.system_surface_container_low_dark),
        SchemeRole.SURFACE_CONTAINER to
            ThemedColour(system.system_surface_container_light, system.system_surface_container_dark),
        SchemeRole.SURFACE_CONTAINER_HIGHEST to
            ThemedColour(system.system_surface_container_highest_light, system.system_surface_container_highest_dark),
        SchemeRole.ON_SURFACE to ThemedColour(system.system_on_surface_light, system.system_on_surface_dark),
        SchemeRole.ON_SURFACE_VARIANT to
            ThemedColour(system.system_on_surface_variant_light, system.system_on_surface_variant_dark),
        SchemeRole.OUTLINE to ThemedColour(system.system_outline_light, system.system_outline_dark),
        SchemeRole.OUTLINE_VARIANT to ThemedColour(system.system_outline_variant_light, system.system_outline_variant_dark),
    )

@RequiresApi(Build.VERSION_CODES.CINNAMON_BUN)
internal fun inverseRoleColours(): SchemeResources =
    mapOf(
        SchemeRole.INVERSE_SURFACE to ThemedColour(system.system_inverse_surface_light, system.system_inverse_surface_dark),
        SchemeRole.INVERSE_ON_SURFACE to
            ThemedColour(system.system_inverse_on_surface_light, system.system_inverse_on_surface_dark),
        SchemeRole.INVERSE_PRIMARY to ThemedColour(system.system_inverse_primary_light, system.system_inverse_primary_dark),
    )

/**
 * Android 12 and 13 publish only the tonal palettes, whose steps 0 to 1000 hold tones 100 down to 0,
 * so each role takes the tone Material's baseline scheme gives it.
 */
@RequiresApi(Build.VERSION_CODES.S)
internal fun paletteTones(): SchemeResources =
    mapOf(
        SchemeRole.PRIMARY to ThemedColour(system.system_accent1_600, system.system_accent1_200),
        SchemeRole.ON_PRIMARY to ThemedColour(system.system_accent1_0, system.system_accent1_800),
        SchemeRole.SECONDARY_CONTAINER to ThemedColour(system.system_accent2_100, system.system_accent2_700),
        SchemeRole.ON_SECONDARY_CONTAINER to ThemedColour(system.system_accent2_900, system.system_accent2_100),
        SchemeRole.TERTIARY_CONTAINER to ThemedColour(system.system_accent3_100, system.system_accent3_700),
        SchemeRole.ON_TERTIARY_CONTAINER to ThemedColour(system.system_accent3_900, system.system_accent3_100),
        SchemeRole.SURFACE to ThemedColour(system.system_neutral1_10, system.system_neutral1_900),
        SchemeRole.SURFACE_CONTAINER_LOW to ThemedColour(system.system_neutral1_50, system.system_neutral1_900),
        SchemeRole.SURFACE_CONTAINER to ThemedColour(system.system_neutral1_50, system.system_neutral1_900),
        SchemeRole.SURFACE_CONTAINER_HIGHEST to ThemedColour(system.system_neutral1_100, system.system_neutral1_800),
        SchemeRole.ON_SURFACE to ThemedColour(system.system_neutral1_900, system.system_neutral1_100),
        SchemeRole.ON_SURFACE_VARIANT to ThemedColour(system.system_neutral2_700, system.system_neutral2_200),
        SchemeRole.OUTLINE to ThemedColour(system.system_neutral2_500, system.system_neutral2_400),
        SchemeRole.OUTLINE_VARIANT to ThemedColour(system.system_neutral2_200, system.system_neutral2_700),
        SchemeRole.INVERSE_SURFACE to ThemedColour(system.system_neutral1_800, system.system_neutral1_100),
        SchemeRole.INVERSE_ON_SURFACE to ThemedColour(system.system_neutral1_50, system.system_neutral1_800),
        SchemeRole.INVERSE_PRIMARY to ThemedColour(system.system_accent1_200, system.system_accent1_600),
    )

internal fun wallpaperScheme(
    resources: SchemeResources,
    colours: ColourResources,
): WallpaperScheme =
    WallpaperScheme(
        resources.mapValues { (_, colour) ->
            ThemedColour(colours.rgb(colour.light) and RGB, colours.rgb(colour.dark) and RGB)
        },
    )
