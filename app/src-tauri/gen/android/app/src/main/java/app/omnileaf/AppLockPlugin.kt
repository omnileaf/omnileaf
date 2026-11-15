package app.omnileaf

import android.app.Activity
import androidx.fragment.app.FragmentActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.PluginManager

@InvokeArg
class ChosenDelay {
    lateinit var lockAfter: String
}

@InvokeArg
class ConfirmingPrompt {
    lateinit var title: String
}

@InvokeArg
class HiddenInRecents {
    var isHidden: Boolean = false
}

internal enum class LockTurning(
    val id: String,
) {
    TURNED_ON("turnedOn"),
    NOT_CONFIRMED("notConfirmed"),
    NO_SCREEN_LOCK("noScreenLock"),
}

internal fun ScreenLockAnswer.turning(): LockTurning =
    when (this) {
        ScreenLockAnswer.CONFIRMED -> LockTurning.TURNED_ON
        ScreenLockAnswer.REFUSED -> LockTurning.NOT_CONFIRMED
        ScreenLockAnswer.NO_SCREEN_LOCK -> LockTurning.NO_SCREEN_LOCK
    }

@TauriPlugin
class AppLockPlugin(
    activity: Activity,
) : Plugin(activity) {
    private val choices = AppLockChoices(activity.applicationContext)

    @Command
    fun read(invoke: Invoke) {
        invoke.resolve(
            JSObject()
                .put("isOn", choices.isOn)
                .put("lockAfter", choices.lockAfter.id)
                .put("hidesContentInRecents", choices.hidesContentInRecents)
                .put("canHideContentInRecents", choices.canHideContentInRecents),
        )
    }

    @Command
    fun turnOn(invoke: Invoke) {
        val title = invoke.parseArgs(ConfirmingPrompt::class.java).title
        val shownActivity = PluginManager.activity as? FragmentActivity
        when {
            title.isBlank() -> invoke.reject("the prompt to turn the app lock on needs a title")
            shownActivity == null -> invoke.reject("no activity is showing the app")
            !shownActivity.hasScreenLock() -> resolve(invoke, LockTurning.NO_SCREEN_LOCK)
            else -> shownActivity.runOnUiThread { confirm(shownActivity, title, invoke) }
        }
    }

    @Command
    fun rememberWords(invoke: Invoke) {
        choices.remember(invoke.parseArgs(LockWords::class.java))
        invoke.resolve()
    }

    @Command
    fun turnOff(invoke: Invoke) {
        choices.turn(isOn = false)
        invoke.resolve()
    }

    @Command
    fun chooseLockAfter(invoke: Invoke) {
        choices.chooseLockAfter(LockAfter.of(invoke.parseArgs(ChosenDelay::class.java).lockAfter))
        invoke.resolve()
    }

    @Command
    fun hideContentInRecents(invoke: Invoke) {
        choices.hideContentInRecents(invoke.parseArgs(HiddenInRecents::class.java).isHidden)
        invoke.resolve()
    }

    private fun confirm(
        shownActivity: FragmentActivity,
        title: String,
        invoke: Invoke,
    ) {
        shownActivity.askForScreenLock(title) { answer ->
            if (answer == ScreenLockAnswer.CONFIRMED) {
                choices.turn(isOn = true)
            }
            resolve(invoke, answer.turning())
        }
    }

    private fun resolve(
        invoke: Invoke,
        turning: LockTurning,
    ) {
        invoke.resolve(JSObject().put("turning", turning.id))
    }
}
