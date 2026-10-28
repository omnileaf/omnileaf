package app.omnileaf

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

@InvokeArg
class WatchingBackGestures {
    lateinit var channel: Channel
}

@TauriPlugin
class BackNavigationPlugin(
    activity: Activity,
) : Plugin(activity) {
    @Command
    fun followHistory(invoke: Invoke) {
        val shownActivity =
            PluginManager.activity as? MainActivity
                ?: return invoke.reject("no activity is showing the app")
        shownActivity.runOnUiThread { shownActivity.backNavigation?.followHistory() }
        invoke.resolve()
    }

    @Command
    fun watchGestures(invoke: Invoke) {
        val channel = invoke.parseArgs(WatchingBackGestures::class.java).channel
        val shownActivity =
            PluginManager.activity as? MainActivity
                ?: return invoke.reject("no activity is showing the app")
        shownActivity.runOnUiThread {
            shownActivity.backNavigation?.watch { gesture -> channel.send(gesture.toJson()) }
        }
        invoke.resolve()
    }
}

private fun BackGesture.toJson(): JSObject =
    when (this) {
        is BackGesture.Moved -> JSObject().put("kind", "moved").put("progress", progress.toDouble())
        BackGesture.Cancelled -> JSObject().put("kind", "cancelled")
    }
