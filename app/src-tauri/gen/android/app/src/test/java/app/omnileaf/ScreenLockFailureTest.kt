package app.omnileaf

import androidx.biometric.BiometricPrompt
import org.junit.Assert.assertEquals
import org.junit.Test

class ScreenLockFailureTest {
    @Test
    fun `names each failure Android reports by a fixed reason`() {
        val codes =
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

        val reasons = codes.keys.associateWith(::screenLockFailure)

        assertEquals(codes, reasons)
    }

    @Test
    fun `names a failure Android adds later as unknown`() {
        val reason = screenLockFailure(Int.MAX_VALUE)

        assertEquals(LogReason.UNKNOWN, reason)
    }
}
