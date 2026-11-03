package app.omnileaf

import android.app.Activity
import android.os.Build
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
            val kept = saveToDownloads(Build.VERSION.SDK_INT, writer, args.name, args.text)
            invoke.resolve(JSObject().put("name", kept))
        } catch (failure: UnsupportedOperationException) {
            invoke.reject(failure.message ?: "saving to Downloads is not offered here")
        } catch (failure: java.io.IOException) {
            invoke.reject(failure.message ?: "save to Downloads")
        }
    }
}
