package app.omnileaf

import kotlin.time.Duration.Companion.milliseconds

internal class LockState(
    private val now: () -> Long,
) {
    private var leftAt: Long? = null
    private var hasStarted = false
    private var isOpeningOwnScreen = false

    var isCovered = false
        private set

    fun left(isStillInTheApp: Boolean) {
        if (!isStillInTheApp && !isOpeningOwnScreen) {
            leftAt = now()
        }
    }

    fun returned(
        isOn: Boolean,
        lockAfter: LockAfter,
    ): Boolean {
        val isDue = isDue(lockAfter)
        leftAt = null
        isOpeningOwnScreen = false
        hasStarted = true
        if (isOn && isDue) {
            isCovered = true
        }
        if (!isOn) {
            isCovered = false
        }
        return isCovered
    }

    fun unlocked() {
        isCovered = false
    }

    fun openingOwnScreen() {
        isOpeningOwnScreen = true
    }

    private fun isDue(lockAfter: LockAfter): Boolean {
        if (!hasStarted) return locksOnReturn(lockAfter, awayFor = null)
        val left = leftAt ?: return false
        return locksOnReturn(lockAfter, (now() - left).milliseconds)
    }
}
