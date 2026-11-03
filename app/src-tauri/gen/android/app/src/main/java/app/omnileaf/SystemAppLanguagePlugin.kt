package app.omnileaf

import android.app.Activity
import android.app.LocaleManager
import android.os.Build
import androidx.annotation.RequiresApi
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@TauriPlugin
class SystemAppLanguagePlugin(
    private val activity: Activity,
) : Plugin(activity) {
    @Command
    fun read(invoke: Invoke) {
        val reply = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reply.put("offered", true).put("tag", chosenTag() ?: JSONObject.NULL)
        } else {
            reply.put("offered", false).put("tag", JSONObject.NULL)
        }
        invoke.resolve(reply)
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun chosenTag(): String? {
        val locales = activity.getSystemService(LocaleManager::class.java).applicationLocales
        return firstLanguageTag(locales.toLanguageTags())
    }
}
