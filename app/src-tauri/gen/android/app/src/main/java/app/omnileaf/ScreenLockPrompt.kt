package app.omnileaf

import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import app.tauri.Logger

/** Android before 11 can pair the screen lock only with weak biometrics in one prompt. */
private val UNLOCKS_WITH: Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        BIOMETRIC_STRONG or DEVICE_CREDENTIAL
    } else {
        BIOMETRIC_WEAK or DEVICE_CREDENTIAL
    }

private val DISMISSED_BY_USER = setOf(BiometricPrompt.ERROR_USER_CANCELED, BiometricPrompt.ERROR_NEGATIVE_BUTTON)

internal fun FragmentActivity.hasScreenLock(): Boolean =
    BiometricManager.from(this).canAuthenticate(UNLOCKS_WITH) == BiometricManager.BIOMETRIC_SUCCESS

/** BiometricPrompt quietly drops a request made after the activity saved its state, so that request is refused here. */
internal fun FragmentActivity.askForScreenLock(
    title: String,
    answer: (ScreenLockAnswer) -> Unit,
) {
    if (supportFragmentManager.isStateSaved) {
        return answer(ScreenLockAnswer.REFUSED)
    }
    BiometricPrompt(
        this,
        ContextCompat.getMainExecutor(this),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                answer(ScreenLockAnswer.CONFIRMED)
            }

            override fun onAuthenticationError(
                errorCode: Int,
                errString: CharSequence,
            ) {
                val screenLockAnswer = ScreenLockAnswer.of(errorCode)
                if (screenLockAnswer == ScreenLockAnswer.REFUSED && errorCode !in DISMISSED_BY_USER) {
                    Logger.warn("the screen lock prompt ended with error $errorCode: $errString")
                }
                answer(screenLockAnswer)
            }
        },
    ).authenticate(
        BiometricPrompt.PromptInfo
            .Builder()
            .setTitle(title)
            .setAllowedAuthenticators(UNLOCKS_WITH)
            .build(),
    )
}
