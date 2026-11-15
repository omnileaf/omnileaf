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
        leaveFor(1)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(true, covers)
    }

    @Test
    fun `waits out the delay before covering`() {
        startedOpen()
        leaveFor(4 * MINUTE_MS)

        val covers = state.returned(isOn = true, LockAfter.FIVE_MINUTES)

        assertEquals(false, covers)
    }

    @Test
    fun `covers once the time away reaches the delay`() {
        startedOpen()
        leaveFor(5 * MINUTE_MS)

        val covers = state.returned(isOn = true, LockAfter.FIVE_MINUTES)

        assertEquals(true, covers)
    }

    @Test
    fun `stays covered when the app is reopened while covered`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)
        state.left(isStillInTheApp = false)

        val covers = state.returned(isOn = true, LockAfter.ONE_HOUR)

        assertEquals(true, covers)
    }

    @Test
    fun `uncovers once the lock is turned off`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)

        val covers = state.returned(isOn = false, LockAfter.ONE_MINUTE)

        assertEquals(false, covers)
    }

    @Test
    fun `stays open on a quick return from a screen Omnileaf opened itself`() {
        startedOpen()
        state.openedOwnScreen()
        leaveFor(MINUTE_MS)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(false, covers)
    }

    @Test
    fun `locks a long trip through a screen Omnileaf opened itself`() {
        startedOpen()
        state.openedOwnScreen()
        leaveFor(OWN_SCREEN_ALLOWANCE.inWholeMilliseconds)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(true, covers)
    }

    @Test
    fun `stays open on an own trip shorter than a longer chosen delay`() {
        startedOpen()
        state.openedOwnScreen()
        leaveFor(10 * MINUTE_MS)

        val covers = state.returned(isOn = true, LockAfter.FIFTEEN_MINUTES)

        assertEquals(false, covers)
    }

    @Test
    fun `locks after returning from a link opened in the browser`() {
        startedOpen()
        leaveFor(1)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(true, covers)
    }

    @Test
    fun `locks a later leave when the own screen never showed`() {
        startedOpen()
        state.openedOwnScreen()
        state.resumed()
        leaveFor(1)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(true, covers)
    }

    @Test
    fun `locks the next time the app is left some other way`() {
        startedOpen()
        state.openedOwnScreen()
        leaveFor(1)
        state.returned(isOn = true, LockAfter.IMMEDIATELY)
        leaveFor(1)

        val covers = state.returned(isOn = true, LockAfter.IMMEDIATELY)

        assertEquals(true, covers)
    }

    @Test
    fun `stays covered after a refused check`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)

        val outcome = state.answered(ScreenLockAnswer.REFUSED)

        assertEquals(LockOutcome.STAY_COVERED, outcome)
        assertEquals(true, state.isCovered)
    }

    @Test
    fun `uncovers on a confirmed check`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)

        val outcome = state.answered(ScreenLockAnswer.CONFIRMED)

        assertEquals(LockOutcome.UNCOVER, outcome)
        assertEquals(false, state.isCovered)
    }

    @Test
    fun `turns the lock off and uncovers when the phone has no screen lock`() {
        state.returned(isOn = true, LockAfter.ONE_MINUTE)

        val outcome = state.answered(ScreenLockAnswer.NO_SCREEN_LOCK)

        assertEquals(LockOutcome.TURN_OFF, outcome)
        assertEquals(false, state.isCovered)
    }

    private fun startedOpen() {
        state.returned(isOn = false, LockAfter.ONE_MINUTE)
    }

    private fun leaveFor(ms: Long) {
        state.left(isStillInTheApp = false)
        clock += ms
    }
}
