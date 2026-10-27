package app.omnileaf

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

@InvokeArg
class Capturing {
  lateinit var channel: Channel
}

@TauriPlugin
class VolumeKeysPlugin(activity: Activity) : Plugin(activity) {
  @Command
  fun capture(invoke: Invoke) {
    val channel = invoke.parseArgs(Capturing::class.java).channel
    val shownActivity = PluginManager.activity as? MainActivity
      ?: return invoke.reject("no activity is showing the app")
    shownActivity.runOnUiThread { shownActivity.volumeKeys.capture { turn -> channel.sendObject(turn.id) } }
    invoke.resolve()
  }

  @Command
  fun release(invoke: Invoke) {
    val shownActivity = PluginManager.activity as? MainActivity
    shownActivity?.runOnUiThread { shownActivity.volumeKeys.release() }
    invoke.resolve()
  }
}
