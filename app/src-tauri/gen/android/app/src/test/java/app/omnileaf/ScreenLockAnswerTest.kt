package app.omnileaf

import androidx.biometric.BiometricPrompt
import org.junit.Assert.assertEquals
import org.junit.Test

class ScreenLockAnswerTest {
    @Test
    fun `reads a phone without a screen lock from the prompt's error`() {
        val answer = ScreenLockAnswer.of(BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL)

        assertEquals(ScreenLockAnswer.NO_SCREEN_LOCK, answer)
    }

    @Test
    fun `reads a cancelled or failed prompt as refused`() {
        val answers =
            listOf(
                BiometricPrompt.ERROR_USER_CANCELED,
                BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                BiometricPrompt.ERROR_LOCKOUT,
            ).map(ScreenLockAnswer::of)

        assertEquals(List(3) { ScreenLockAnswer.REFUSED }, answers)
    }

    @Test
    fun `answers turning the lock on with the id the interface reads`() {
        val ids = ScreenLockAnswer.entries.map { it.turning().id }

        assertEquals(listOf("turnedOn", "notConfirmed", "noScreenLock"), ids)
    }
}
