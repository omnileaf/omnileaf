package app.omnileaf

import android.app.Activity
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class SystemBoldTextPlugin(
    private val activity: Activity,
) : Plugin(activity) {
    @Command
    fun read(invoke: Invoke) {
        val adjustment =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                activity.resources.configuration.fontWeightAdjustment
            } else {
                null
            }
        invoke.resolve(JSObject().put("isBold", isBoldText(adjustment)))
    }
}
