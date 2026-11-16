package app.omnileaf

import androidx.biometric.BiometricPrompt

internal enum class ScreenLockAnswer {
    CONFIRMED,
    REFUSED,
    NO_SCREEN_LOCK,
    ;

    companion object {
        fun of(errorCode: Int): ScreenLockAnswer = if (errorCode == BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL) NO_SCREEN_LOCK else REFUSED
    }
}
