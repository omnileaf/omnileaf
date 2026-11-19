package app.omnileaf

import android.app.Activity
import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.annotation.ColorInt
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

@InvokeArg
class BarIcons(
    var areDark: Boolean = false,
)

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
    var remembered: StartingTheme = StartingTheme.DEVICE
}

@TauriPlugin
class SystemBarsPlugin(
    activity: Activity,
) : Plugin(activity) {
    private val remembered = RememberedTheme(activity.applicationContext)

    @Command
    fun rememberedTheme(invoke: Invoke) {
        invoke.resolve(rememberedThemeReply(remembered.stored()))
    }

    @Command
    fun showIcons(invoke: Invoke) {
        val icons = invoke.parseArgs(BarIcons::class.java)
        val shownActivity = PluginManager.activity ?: return invoke.reject("no activity is showing the app")
        shownActivity.runOnUiThread { shownActivity.showBarIcons(icons) }
        invoke.resolve()
    }

    @Command
    fun showBackground(invoke: Invoke) {
        val background = invoke.parseArgs(WindowBackground::class.java)
        val color = background.shown.color()
        val shownActivity = PluginManager.activity as? MainActivity ?: return invoke.reject("no activity is showing the app")
        RememberedTheme(shownActivity).keep(background.remembered)
        shownActivity.keepStartingTheme(background.remembered)
        shownActivity.runOnUiThread { shownActivity.showPageBackground(color) }
        invoke.resolve()
    }
}

fun ComponentActivity.showBarIcons(icons: BarIcons) {
    enableEdgeToEdge(
        statusBarStyle = barStyle(icons),
        navigationBarStyle = barStyle(icons),
    )
}

private fun barStyle(icons: BarIcons): SystemBarStyle =
    if (icons.areDark) SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT) else SystemBarStyle.dark(Color.TRANSPARENT)
