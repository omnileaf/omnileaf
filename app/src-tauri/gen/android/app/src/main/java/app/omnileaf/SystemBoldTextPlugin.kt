package app.omnileaf

import android.app.Activity
import android.content.res.Configuration
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class WatchingBoldText {
    lateinit var channel: Channel
}

@TauriPlugin
class SystemBoldTextPlugin(
    private val activity: Activity,
) : Plugin(activity) {
    private var changes: BoldTextChanges? = null

    @Command
    fun watch(invoke: Invoke) {
        val channel = invoke.parseArgs(WatchingBoldText::class.java).channel
        val following = BoldTextChanges { isBold -> channel.sendObject(isBold) }
        changes = following
        follow(activity.resources.configuration)
        invoke.resolve()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        follow(newConfig)
    }

    private fun follow(configuration: Configuration) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            changes?.follow(configuration.fontWeightAdjustment)
        }
    }
}
