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
        state.left(isChangingScreens = true)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(false, covers)
    }

    @Test
    fun `covers a quick return when set to lock immediately`() {
        startedOpen()
        state.left(isChangingScreens = false)
        clock += 1

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(true, covers)
    }

    @Test
    fun `waits out the delay before covering`() {
        startedOpen()
        state.left(isChangingScreens = false)
        clock += 4 * MINUTE_MS

        val covers = state.returned(isOn = true, LockAfter.FIVE_MINUTES)

        assertEquals(false, covers)
    }

    @Test
    fun `stays covered when the app is reopened while covered`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)
        state.left(isChangingScreens = false)

        val covers = state.returned(isOn = true, LockAfter.ONE_HOUR)

        assertEquals(true, covers)
    }

    @Test
    fun `asks once at a time`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)

        val asks = listOf(state.startAsking(), state.startAsking())

        assertEquals(listOf(true, false), asks)
    }

    @Test
    fun `does not count the screen lock's own screen as leaving`() {
        state.returned(isOn = true, LockAfter.IMMEDIATELY)
        state.startAsking()
        state.left(isChangingScreens = false)
        state.answered(ScreenLockAnswer.CONFIRMED)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(false, covers)
    }

    @Test
    fun `uncovers only on a confirmed answer`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)
        val covered =
            listOf(ScreenLockAnswer.REFUSED, ScreenLockAnswer.NO_SCREEN_LOCK, ScreenLockAnswer.CONFIRMED).map {
                state.startAsking()
                state.answered(it)
                state.isCovered
            }

        assertEquals(listOf(true, true, false), covered)
    }

    private fun startedOpen() {
        state.returned(isOn = false, LockAfter.ONE_MINUTE)
    }
}
