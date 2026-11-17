package app.omnileaf

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager
import org.json.JSONObject

private const val NO_SHOWN_ACTIVITY = "no activity is showing the app"

@TauriPlugin
class RestoredRoutePlugin(
    activity: Activity,
) : Plugin(activity) {
    @Command
    fun savedRoute(invoke: Invoke) {
        val requests = shownLaunchRequests() ?: return invoke.reject(NO_SHOWN_ACTIVITY)
        invoke.resolve(JSObject().put("route", requests.savedRoute() ?: JSONObject.NULL))
    }

    @Command
    fun openingPageShown(invoke: Invoke) {
        val requests = shownLaunchRequests() ?: return invoke.reject(NO_SHOWN_ACTIVITY)
        requests.openingPageShown()
        invoke.resolve()
    }

    private fun shownLaunchRequests(): LaunchRequests? = (PluginManager.activity as? MainActivity)?.launchRequests
}
