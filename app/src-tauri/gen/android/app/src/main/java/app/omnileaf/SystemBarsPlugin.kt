package app.omnileaf

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.annotation.ColorInt
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

@InvokeArg
class PageBackground {
  var red: Int = 0
  var green: Int = 0
  var blue: Int = 0

  @ColorInt
  fun color(): Int = Color.rgb(red, green, blue)
}

@InvokeArg
class WindowBackground {
  var shown: PageBackground = PageBackground()
  var remembered: PageBackground? = null
}

@TauriPlugin
class SystemBarsPlugin(activity: Activity) : Plugin(activity) {
  private var webView: WebView? = null

  override fun load(webView: WebView) {
    this.webView = webView
  }

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

  @Command
  fun showBackground(invoke: Invoke) {
    val background = invoke.parseArgs(WindowBackground::class.java)
    val color = background.shown.color()
    val shownActivity = PluginManager.activity ?: return invoke.reject("no activity is showing the app")
    RememberedBackground(shownActivity).keep(background.remembered)
    shownActivity.runOnUiThread {
      shownActivity.showPageBackground(color)
      webView?.setBackgroundColor(color)
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
