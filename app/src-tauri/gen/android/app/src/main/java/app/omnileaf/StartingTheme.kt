package app.omnileaf

import android.app.Activity
import android.app.UiModeManager
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

internal fun StartingTheme.applicationNightMode(): Int =
    when (this) {
        StartingTheme.DEVICE -> UiModeManager.MODE_NIGHT_AUTO
        StartingTheme.LIGHT -> UiModeManager.MODE_NIGHT_NO
        StartingTheme.DARK -> UiModeManager.MODE_NIGHT_YES
    }

/** From Android 12 the system keeps an app's own night mode across cold starts and updates, and draws the splash screen in it. */
fun Activity.keepStartingTheme(theme: StartingTheme) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        keepApplicationNightMode(theme)
    }
}

@RequiresApi(Build.VERSION_CODES.S)
private fun Activity.keepApplicationNightMode(theme: StartingTheme) {
    getSystemService(UiModeManager::class.java).setApplicationNightMode(theme.applicationNightMode())
}

@StyleRes
internal fun StartingTheme.style(): Int =
    when (this) {
        StartingTheme.DEVICE -> R.style.Theme_omnileaf_app
        StartingTheme.LIGHT -> R.style.Theme_omnileaf_app_Light
        StartingTheme.DARK -> R.style.Theme_omnileaf_app_Dark
    }
