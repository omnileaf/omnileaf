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
class WatchingDocuments {
    lateinit var channel: Channel
}

@TauriPlugin
class OpenWithPlugin(
    activity: Activity,
) : Plugin(activity) {
    @Command
    fun watch(invoke: Invoke) {
        val channel = invoke.parseArgs(WatchingDocuments::class.java).channel
        val shownActivity =
            PluginManager.activity as? MainActivity
                ?: return invoke.reject("no activity is showing the app")
        shownActivity.handedDocuments.watch { uri -> channel.sendObject(uri) }
        invoke.resolve()
    }
}
