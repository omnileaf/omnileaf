package app.omnileaf

import android.app.Activity
import android.text.format.DateFormat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class SystemClockPlugin(
    private val activity: Activity,
) : Plugin(activity) {
    @Command
    fun read(invoke: Invoke) {
        val clock = HourClock.of(DateFormat.is24HourFormat(activity))
        invoke.resolve(JSObject().put("clock", clock.id))
    }
}
