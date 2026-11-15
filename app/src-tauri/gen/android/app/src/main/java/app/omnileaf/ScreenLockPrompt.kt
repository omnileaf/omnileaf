package app.omnileaf

import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity

/** Android before 11 can pair the screen lock only with weak biometrics in one prompt. */
private val UNLOCKS_WITH: Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        BIOMETRIC_STRONG or DEVICE_CREDENTIAL
    } else {
        BIOMETRIC_WEAK or DEVICE_CREDENTIAL
    }

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
        mainExecutor,
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                answer(ScreenLockAnswer.CONFIRMED)
            }

            override fun onAuthenticationError(
                errorCode: Int,
                errString: CharSequence,
            ) {
                answer(answerFor(errorCode))
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

private fun answerFor(errorCode: Int): ScreenLockAnswer =
    if (errorCode == BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL) {
        ScreenLockAnswer.NO_SCREEN_LOCK
    } else {
        ScreenLockAnswer.REFUSED
    }
