package app.omnileaf

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager
import org.json.JSONObject

@TauriPlugin
class RestoredRoutePlugin(
    activity: Activity,
) : Plugin(activity) {
    @Command
    fun take(invoke: Invoke) {
        val shownActivity =
            PluginManager.activity as? MainActivity
                ?: return invoke.reject("no activity is showing the app")
        val route = shownActivity.launchRequests.takeRoute()
        invoke.resolve(JSObject().put("route", route ?: JSONObject.NULL))
    }
}
