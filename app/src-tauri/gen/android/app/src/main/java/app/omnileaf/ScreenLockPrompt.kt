package app.omnileaf

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

private const val UNLOCKS_WITH: Int = BIOMETRIC_STRONG or DEVICE_CREDENTIAL

private val DISMISSED_BY_USER = setOf(BiometricPrompt.ERROR_USER_CANCELED, BiometricPrompt.ERROR_NEGATIVE_BUTTON)

private val SCREEN_LOCK_FAILURES: Map<Int, LogReason> =
    mapOf(
        BiometricPrompt.ERROR_HW_UNAVAILABLE to LogReason.HARDWARE_UNAVAILABLE,
        BiometricPrompt.ERROR_UNABLE_TO_PROCESS to LogReason.UNABLE_TO_PROCESS,
        BiometricPrompt.ERROR_TIMEOUT to LogReason.TIMEOUT,
        BiometricPrompt.ERROR_NO_SPACE to LogReason.NO_SPACE,
        BiometricPrompt.ERROR_CANCELED to LogReason.CANCELED,
        BiometricPrompt.ERROR_LOCKOUT to LogReason.LOCKOUT,
        BiometricPrompt.ERROR_VENDOR to LogReason.VENDOR,
        BiometricPrompt.ERROR_LOCKOUT_PERMANENT to LogReason.LOCKOUT_PERMANENT,
        BiometricPrompt.ERROR_NO_BIOMETRICS to LogReason.NO_BIOMETRICS,
        BiometricPrompt.ERROR_HW_NOT_PRESENT to LogReason.HARDWARE_NOT_PRESENT,
        BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL to LogReason.NO_DEVICE_CREDENTIAL,
        BiometricPrompt.ERROR_SECURITY_UPDATE_REQUIRED to LogReason.SECURITY_UPDATE_REQUIRED,
    )

internal fun screenLockFailure(errorCode: Int): LogReason = SCREEN_LOCK_FAILURES[errorCode] ?: LogReason.UNKNOWN

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
                    APP_LOG.warn(LogEvent.SCREEN_LOCK_PROMPT_FAILED, screenLockFailure(errorCode))
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
