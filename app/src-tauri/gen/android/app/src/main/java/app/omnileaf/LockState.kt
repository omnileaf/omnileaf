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
    private var away: Away? = null
    private var hasStarted = false
    private var isOwnScreenOpening = false

    var isCovered = false
        private set

    fun left(isStillInTheApp: Boolean) {
        if (isStillInTheApp) return
        away = Away(at = now(), isOwnScreenTrip = isOwnScreenOpening)
        isOwnScreenOpening = false
    }

    fun returned(
        isOn: Boolean,
        lockAfter: LockAfter,
    ): Boolean {
        val isDue = isDue(lockAfter)
        away = null
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
        val trip = away ?: return false
        return (now() - trip.at).milliseconds >= trip.delayFor(lockAfter)
    }

    private data class Away(
        val at: Long,
        val isOwnScreenTrip: Boolean,
    ) {
        fun delayFor(lockAfter: LockAfter): Duration =
            if (isOwnScreenTrip) maxOf(lockAfter.delay, OWN_SCREEN_ALLOWANCE) else lockAfter.delay
    }
}
