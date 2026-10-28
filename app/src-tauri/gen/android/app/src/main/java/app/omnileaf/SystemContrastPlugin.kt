package app.omnileaf

import android.app.Activity
import android.app.UiModeManager
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class WatchingContrast {
    lateinit var channel: Channel
}

@TauriPlugin
class SystemContrastPlugin(
    private val activity: Activity,
) : Plugin(activity) {
    private var listener: UiModeManager.ContrastChangeListener? = null

    @Command
    fun watch(invoke: Invoke) {
        val channel = invoke.parseArgs(WatchingContrast::class.java).channel
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            follow(channel)
        } else {
            channel.sendObject(SystemContrast.STANDARD.id)
        }
        invoke.resolve()
    }

    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private fun follow(channel: Channel) {
        val uiModes = activity.getSystemService(UiModeManager::class.java)
        stopFollowing(uiModes)
        val following =
            UiModeManager.ContrastChangeListener { level ->
                channel.sendObject(SystemContrast.of(level).id)
            }
        uiModes.addContrastChangeListener(activity.mainExecutor, following)
        listener = following
        channel.sendObject(SystemContrast.of(uiModes.contrast).id)
    }

    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private fun stopFollowing(uiModes: UiModeManager) {
        listener?.let(uiModes::removeContrastChangeListener)
        listener = null
    }

    override fun onDestroy(activity: AppCompatActivity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            stopFollowing(activity.getSystemService(UiModeManager::class.java))
        }
    }
}
