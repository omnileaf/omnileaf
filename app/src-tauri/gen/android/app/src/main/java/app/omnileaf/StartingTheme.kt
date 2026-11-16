package app.omnileaf

import android.app.Activity
import android.content.res.Resources
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.annotation.ColorRes
import androidx.annotation.RequiresApi
import androidx.annotation.StyleRes
import app.tauri.annotation.InvokeArg

@InvokeArg
enum class StartingTheme {
    DEVICE,
    LIGHT,
    DARK,
}

@ColorRes
fun StartingTheme.pageBackground(): Int =
    when (this) {
        StartingTheme.DEVICE -> R.color.page_background
        StartingTheme.LIGHT -> R.color.page_background_light
        StartingTheme.DARK -> R.color.page_background_dark
    }

fun ComponentActivity.showStartingBarIcons(theme: StartingTheme) {
    when (theme) {
        StartingTheme.DEVICE -> enableEdgeToEdge()
        StartingTheme.LIGHT -> showBarIcons(BarIcons(areDark = true))
        StartingTheme.DARK -> showBarIcons(BarIcons(areDark = false))
    }
}

/** From Android 13 the system keeps this theme for the app's later cold starts. */
fun Activity.keepSplashScreenTheme(theme: StartingTheme) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        splashScreen.setSplashScreenTheme(theme.splashScreenStyle())
    }
}

@StyleRes
internal fun StartingTheme.style(): Int =
    when (this) {
        StartingTheme.DEVICE -> R.style.Theme_omnileaf_app
        StartingTheme.LIGHT -> R.style.Theme_omnileaf_app_Light
        StartingTheme.DARK -> R.style.Theme_omnileaf_app_Dark
    }

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
@StyleRes
private fun StartingTheme.splashScreenStyle(): Int = if (this == StartingTheme.DEVICE) Resources.ID_NULL else style()

internal data class LockColours(
    @param:ColorRes val onSurface: Int,
    @param:ColorRes val onSurfaceMuted: Int,
    @param:ColorRes val primary: Int,
    @param:ColorRes val onPrimary: Int,
)

internal fun StartingTheme.lockColours(): LockColours =
    when (this) {
        StartingTheme.DEVICE -> {
            LockColours(R.color.on_surface, R.color.on_surface_muted, R.color.primary, R.color.on_primary)
        }

        StartingTheme.LIGHT -> {
            LockColours(
                R.color.on_surface_light,
                R.color.on_surface_muted_light,
                R.color.primary_light,
                R.color.on_primary_light,
            )
        }

        StartingTheme.DARK -> {
            LockColours(R.color.on_surface_dark, R.color.on_surface_muted_dark, R.color.primary_dark, R.color.on_primary_dark)
        }
    }
