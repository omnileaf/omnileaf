package app.omnileaf

import android.app.Activity
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
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
    var lockAfter: String = LockAfter.DEFAULT.id
}

@InvokeArg
class ConfirmingPrompt {
    var title: String = ""
}

@InvokeArg
class HiddenContent {
    var isHidden: Boolean = false
}

private enum class LockTurning(
    val id: String,
) {
    TURNED_ON("turnedOn"),
    NOT_CONFIRMED("notConfirmed"),
    NO_SCREEN_LOCK("noScreenLock"),
}

/** Android before 11 can pair the screen lock only with weak biometrics in one prompt. */
private val UNLOCKS_WITH: Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        BIOMETRIC_STRONG or DEVICE_CREDENTIAL
    } else {
        BIOMETRIC_WEAK or DEVICE_CREDENTIAL
    }

@TauriPlugin
class AppLockPlugin(
    private val activity: Activity,
) : Plugin(activity) {
    private val choices by lazy { AppLockChoices(activity) }

    @Command
    fun read(invoke: Invoke) {
        invoke.resolve(
            JSObject()
                .put("isOn", choices.isOn)
                .put("lockAfter", choices.lockAfter.id)
                .put("hidesContent", choices.hidesContent)
                .put("canHideContent", choices.canHideContent),
        )
    }

    @Command
    fun turnOn(invoke: Invoke) {
        val shownActivity =
            PluginManager.activity as? FragmentActivity
                ?: return invoke.reject("no activity is showing the app")
        if (BiometricManager.from(shownActivity).canAuthenticate(UNLOCKS_WITH) != BiometricManager.BIOMETRIC_SUCCESS) {
            return resolve(invoke, LockTurning.NO_SCREEN_LOCK)
        }
        val title = invoke.parseArgs(ConfirmingPrompt::class.java).title
        shownActivity.runOnUiThread { confirm(shownActivity, title, invoke) }
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
    fun hideContent(invoke: Invoke) {
        choices.hideContent(invoke.parseArgs(HiddenContent::class.java).isHidden)
        invoke.resolve()
    }

    private fun confirm(
        shownActivity: FragmentActivity,
        title: String,
        invoke: Invoke,
    ) {
        val prompt =
            BiometricPrompt(
                shownActivity,
                shownActivity.mainExecutor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        choices.turn(isOn = true)
                        resolve(invoke, LockTurning.TURNED_ON)
                    }

                    override fun onAuthenticationError(
                        errorCode: Int,
                        errString: CharSequence,
                    ) {
                        resolve(invoke, LockTurning.NOT_CONFIRMED)
                    }
                },
            )
        prompt.authenticate(
            BiometricPrompt.PromptInfo
                .Builder()
                .setTitle(title)
                .setAllowedAuthenticators(UNLOCKS_WITH)
                .build(),
        )
    }

    private fun resolve(
        invoke: Invoke,
        turning: LockTurning,
    ) {
        invoke.resolve(JSObject().put("turning", turning.id))
    }
}
