package app.omnileaf

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

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
}
