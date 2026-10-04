package app.omnileaf

import android.app.Activity
import android.graphics.Color
import android.os.Build
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

private val LIGHT_SCRIM = Color.argb(0xe6, 0xff, 0xff, 0xff)
private val DARK_SCRIM = Color.argb(0x80, 0x1b, 0x1b, 0x1b)

@InvokeArg
class BarIcons {
  var areDark: Boolean = false
}

@TauriPlugin
class SystemBarsPlugin(activity: Activity) : Plugin(activity) {
  @Command
  fun showIcons(invoke: Invoke) {
    val icons = invoke.parseArgs(BarIcons::class.java)
    val shownActivity = PluginManager.activity ?: return invoke.reject("no activity is showing the app")
    shownActivity.runOnUiThread {
      shownActivity.enableEdgeToEdge(
        statusBarStyle = barStyle(icons, Color.TRANSPARENT, Color.TRANSPARENT),
        navigationBarStyle = navigationBarStyle(icons),
      )
    }
    invoke.resolve()
  }
}

/** From Android 10 the app shows behind the navigation buttons, while older versions keep a scrim that has to suit the icons. */
private fun navigationBarStyle(icons: BarIcons): SystemBarStyle =
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) barStyle(icons, Color.TRANSPARENT, Color.TRANSPARENT)
  else barStyle(icons, LIGHT_SCRIM, DARK_SCRIM)

private fun barStyle(icons: BarIcons, lightScrim: Int, darkScrim: Int): SystemBarStyle =
  if (icons.areDark) SystemBarStyle.light(lightScrim, darkScrim) else SystemBarStyle.dark(darkScrim)
