package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

private const val MINUTE_MS = 60_000L

class LockStateTest {
    private var clock = 0L
    private val state = LockState { clock }

    @Test
    fun `covers a fresh start while the lock is on`() {
        val covers = state.returned(isOn = true, LockAfter.ONE_HOUR)

        assertEquals(true, covers)
        assertEquals(true, state.isCovered)
    }

    @Test
    fun `stays open while the lock is off`() {
        val covers = state.returned(isOn = false, LockAfter.IMMEDIATELY)

        assertEquals(false, covers)
    }

    @Test
    fun `stays open after a screen is rebuilt in place`() {
        startedOpen()
        state.left(isStillInTheApp = true)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(false, covers)
    }

    @Test
    fun `covers a quick return when set to lock immediately`() {
        startedOpen()
        state.left(isStillInTheApp = false)
        clock += 1

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(true, covers)
    }

    @Test
    fun `waits out the delay before covering`() {
        startedOpen()
        state.left(isStillInTheApp = false)
        clock += 4 * MINUTE_MS

        val covers = state.returned(isOn = true, LockAfter.FIVE_MINUTES)

        assertEquals(false, covers)
    }

    @Test
    fun `stays covered when the app is reopened while covered`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)
        state.left(isStillInTheApp = false)

        val covers = state.returned(isOn = true, LockAfter.ONE_HOUR)

        assertEquals(true, covers)
    }

    @Test
    fun `stays covered for a rebuilt screen until unlocked`() {
        state.returned(isOn = true, LockAfter.ONE_HOUR)
        state.left(isStillInTheApp = true)

        val coversRebuilt = state.returned(isOn = true, LockAfter.ONE_HOUR)
        state.unlocked()

        assertEquals(true, coversRebuilt)
        assertEquals(false, state.isCovered)
    }

    @Test
    fun `uncovers once the lock is turned off`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)

        val covers = state.returned(isOn = false, LockAfter.ONE_MINUTE)

        assertEquals(false, covers)
    }

    private fun startedOpen() {
        state.returned(isOn = false, LockAfter.ONE_MINUTE)
    }
}
