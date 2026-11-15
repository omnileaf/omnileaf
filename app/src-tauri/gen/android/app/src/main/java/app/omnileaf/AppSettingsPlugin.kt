package app.omnileaf

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

@TauriPlugin
class AppSettingsPlugin(
    activity: Activity,
) : Plugin(activity) {
    @Command
    fun openAppSettings(invoke: Invoke) {
        show(invoke) { shownActivity ->
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", shownActivity.packageName, null),
            )
        }
    }

    @Command
    fun openAccessibilitySettings(invoke: Invoke) {
        show(invoke) { Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS) }
    }

    private fun show(
        invoke: Invoke,
        settingsFor: (Activity) -> Intent,
    ) {
        val shownActivity = PluginManager.activity ?: return invoke.reject("no activity is showing the app")
        val settings = settingsFor(shownActivity)
        try {
            shownActivity.startActivity(settings)
            invoke.resolve()
        } catch (missing: ActivityNotFoundException) {
            invoke.reject("no settings app can show ${settings.action}: ${missing.message}")
        }
    }
}
