package app.omnileaf

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SaveDownloadArgs {
    lateinit var name: String
    lateinit var text: String
}

@TauriPlugin
class ReportDownloadsPlugin(
    activity: Activity,
) : Plugin(activity) {
    private val writer = MediaStoreDownloads(activity.applicationContext.contentResolver)

    @Command
    fun saveToDownloads(invoke: Invoke) {
        val args = invoke.parseArgs(SaveDownloadArgs::class.java)
        try {
            val kept = saveToDownloads(writer, args.name, args.text)
            invoke.resolve(JSObject().put("name", kept))
        } catch (failure: java.io.IOException) {
            invoke.reject(failure.message ?: "save to Downloads")
        }
    }
}
