package app.omnileaf

import android.os.Build
import org.junit.Assert.assertEquals
import org.junit.Test

class RecentsProtectionTest {
    @Test
    fun `shows a plain recents card while the lock is on from android 13`() {
        val protections =
            listOf(Build.VERSION_CODES.TIRAMISU, Build.VERSION_CODES.BAKLAVA).map {
                RecentsProtection.of(isLockOn = true, sdk = it)
            }

        assertEquals(listOf(RecentsProtection.PLAIN_CARD, RecentsProtection.PLAIN_CARD), protections)
    }

    @Test
    fun `secures the window while the lock is on before android 13`() {
        val protections =
            listOf(Build.VERSION_CODES.S, Build.VERSION_CODES.S_V2).map {
                RecentsProtection.of(isLockOn = true, sdk = it)
            }

        assertEquals(listOf(RecentsProtection.SECURE_WINDOW, RecentsProtection.SECURE_WINDOW), protections)
    }

    @Test
    fun `leaves the recents card alone while the lock is off`() {
        val protections =
            listOf(Build.VERSION_CODES.S, Build.VERSION_CODES.TIRAMISU).map {
                RecentsProtection.of(isLockOn = false, sdk = it)
            }

        assertEquals(listOf(RecentsProtection.NONE, RecentsProtection.NONE), protections)
    }
}
