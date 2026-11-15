package app.omnileaf

import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes

internal val OWN_SCREEN_ALLOWANCE = 5.minutes

internal enum class LockOutcome {
    STAY_COVERED,
    UNCOVER,
    TURN_OFF,
}

internal class LockState(
    private val now: () -> Long,
) {
    private var leftAt: Long? = null
    private var hasStarted = false
    private var isOwnScreenOpening = false
    private var isOwnScreenTrip = false

    var isCovered = false
        private set

    fun left(isStillInTheApp: Boolean) {
        if (isStillInTheApp) return
        leftAt = now()
        isOwnScreenTrip = isOwnScreenOpening
        isOwnScreenOpening = false
    }

    fun returned(
        isOn: Boolean,
        lockAfter: LockAfter,
    ): Boolean {
        val isDue = isDue(lockAfter)
        leftAt = null
        isOwnScreenTrip = false
        hasStarted = true
        isCovered = isOn && (isCovered || isDue)
        return isCovered
    }

    fun openedOwnScreen() {
        isOwnScreenOpening = true
    }

    fun resumed() {
        isOwnScreenOpening = false
    }

    fun answered(answer: ScreenLockAnswer): LockOutcome {
        val outcome =
            when (answer) {
                ScreenLockAnswer.CONFIRMED -> LockOutcome.UNCOVER
                ScreenLockAnswer.REFUSED -> LockOutcome.STAY_COVERED
                ScreenLockAnswer.NO_SCREEN_LOCK -> LockOutcome.TURN_OFF
            }
        isCovered = outcome == LockOutcome.STAY_COVERED
        return outcome
    }

    private fun isDue(lockAfter: LockAfter): Boolean {
        if (!hasStarted) return true
        val left = leftAt ?: return false
        return (now() - left).milliseconds >= delayFor(lockAfter)
    }

    private fun delayFor(lockAfter: LockAfter): Duration =
        if (isOwnScreenTrip) maxOf(lockAfter.delay, OWN_SCREEN_ALLOWANCE) else lockAfter.delay
}
