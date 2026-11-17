package app.omnileaf

import java.time.Duration
import java.time.Instant
import java.util.concurrent.locks.Lock
import java.util.concurrent.locks.ReentrantLock

private const val LEAST_HOURS_BETWEEN_CHECKS = 22L
internal val LEAST_TIME_BETWEEN_CHECKS: Duration = Duration.ofHours(LEAST_HOURS_BETWEEN_CHECKS)
private val ONE_CHECK_AT_A_TIME: Lock = ReentrantLock()

internal sealed interface DailyRun {
    data object NotDue : DailyRun

    data object VersionUnreadable : DailyRun

    data class Checked(
        val result: CheckResult,
    ) : DailyRun
}

internal class DailyUpdateCheck(
    private val state: UpdateState,
    private val installed: InstalledRelease,
    private val feedFor: (ReleaseVersion) -> ReleaseFeed = { GitHubReleaseFeed(it) },
) {
    fun runIfDue(now: Instant): DailyRun {
        ONE_CHECK_AT_A_TIME.lockInterruptibly()
        try {
            return checkIfDue(now)
        } finally {
            ONE_CHECK_AT_A_TIME.unlock()
        }
    }

    private fun checkIfDue(now: Instant): DailyRun {
        if (!isDue(state.attemptedAt, now)) return DailyRun.NotDue
        val version = installed.version() ?: return DailyRun.VersionUnreadable
        state.markAttempted(now)
        val result = UpdateCheck(feedFor(version)).check(version)
        if (Thread.interrupted()) throw InterruptedException("the daily update check was stopped")
        state.record(result, now)
        return DailyRun.Checked(result)
    }
}

private fun isDue(
    attemptedAt: Instant?,
    now: Instant,
): Boolean = attemptedAt == null || attemptedAt.isAfter(now) || !now.isBefore(attemptedAt + LEAST_TIME_BETWEEN_CHECKS)
