package app.omnileaf

import android.app.Activity
import android.content.Context
import android.os.PowerManager
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class PowerSavingPlugin(activity: Activity) : Plugin(activity) {
  private val context: Context = activity.applicationContext

  @Command
  fun readPowerSaving(invoke: Invoke) {
    val isSaving = context.getSystemService(PowerManager::class.java)?.isPowerSaveMode ?: false
    invoke.resolve(JSObject().put("saving", isSaving))
  }
}
