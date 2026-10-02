package app.omnileaf

import android.app.Activity
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

@InvokeArg
class BarIcons {
  var areDark: Boolean = false
}

/** Restyles the bar icons of the current activity, since the one this plugin was created with is gone once Android recreates it. */
@TauriPlugin
class SystemBarsPlugin(activity: Activity) : Plugin(activity) {
  @Command
  fun showIcons(invoke: Invoke) {
    val icons = invoke.parseArgs(BarIcons::class.java)
    val activity = PluginManager.activity ?: return invoke.reject("no activity is showing the app")
    activity.runOnUiThread {
      WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
        isAppearanceLightStatusBars = icons.areDark
        isAppearanceLightNavigationBars = icons.areDark
      }
    }
    invoke.resolve()
  }
}
