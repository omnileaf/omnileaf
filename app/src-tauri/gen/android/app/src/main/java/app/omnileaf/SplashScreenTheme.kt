package app.omnileaf

import android.app.Activity
import android.content.res.Resources
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.annotation.StyleRes
import app.tauri.annotation.InvokeArg

@InvokeArg
enum class SplashScreenTheme {
  DEVICE,
  LIGHT,
  DARK,
}

/** From Android 13 the system keeps this theme for the app's later cold starts. */
fun Activity.keepSplashScreenTheme(theme: SplashScreenTheme) {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    splashScreen.setSplashScreenTheme(theme.styleId())
  }
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
@StyleRes
private fun SplashScreenTheme.styleId(): Int =
  when (this) {
    SplashScreenTheme.DEVICE -> Resources.ID_NULL
    SplashScreenTheme.LIGHT -> R.style.Theme_omnileaf_app_Light
    SplashScreenTheme.DARK -> R.style.Theme_omnileaf_app_Dark
  }
