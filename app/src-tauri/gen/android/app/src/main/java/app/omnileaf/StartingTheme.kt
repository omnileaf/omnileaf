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

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
@StyleRes
private fun StartingTheme.splashScreenStyle(): Int =
  when (this) {
    StartingTheme.DEVICE -> Resources.ID_NULL
    StartingTheme.LIGHT -> R.style.Theme_omnileaf_app_Light
    StartingTheme.DARK -> R.style.Theme_omnileaf_app_Dark
  }
