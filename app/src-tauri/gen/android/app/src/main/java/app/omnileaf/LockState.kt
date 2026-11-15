package app.omnileaf

import kotlin.time.Duration.Companion.milliseconds

internal class LockState(
    private val now: () -> Long,
) {
    private var leftAt: Long? = null
    private var hasStarted = false

    var isCovered = false
        private set

    var isAsking = false
        private set

    fun left(isChangingScreens: Boolean) {
        if (!isChangingScreens && !isAsking) {
            leftAt = now()
        }
    }

    fun returned(
        isOn: Boolean,
        lockAfter: LockAfter,
    ): Boolean {
        val isDue = isDue(lockAfter)
        leftAt = null
        hasStarted = true
        if (isOn && isDue) {
            isCovered = true
        }
        return isOn && isCovered
    }

    fun startAsking(): Boolean {
        if (!isCovered || isAsking) return false
        isAsking = true
        return true
    }

    fun answered(answer: ScreenLockAnswer) {
        isAsking = false
        if (answer == ScreenLockAnswer.CONFIRMED) {
            isCovered = false
        }
    }

    private fun isDue(lockAfter: LockAfter): Boolean {
        if (!hasStarted) return locksOnReturn(lockAfter, awayFor = null)
        val left = leftAt ?: return false
        return locksOnReturn(lockAfter, (now() - left).milliseconds)
    }
}
