package app.omnileaf

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

@InvokeArg
class Turning {
  var followsDevice: Boolean = false
}

@TauriPlugin
class ScreenOrientationPlugin(activity: Activity) : Plugin(activity) {
  @Command
  fun turn(invoke: Invoke) {
    val turning = invoke.parseArgs(Turning::class.java)
    val shownActivity = PluginManager.activity as? MainActivity
      ?: return invoke.reject("no activity is showing the app")
    val orientation = if (turning.followsDevice) ScreenOrientation.FollowDevice else ScreenOrientation.PortraitOnPhones
    shownActivity.runOnUiThread { shownActivity.orient(orientation) }
    invoke.resolve()
  }
}
