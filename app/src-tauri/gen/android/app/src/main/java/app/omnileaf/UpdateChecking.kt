package app.omnileaf

import java.time.Clock
import java.time.Duration
import java.time.Instant

private const val HOURS_BETWEEN_CHECKS = 24L

private val CHECK_INTERVAL: Duration = Duration.ofHours(HOURS_BETWEEN_CHECKS)

internal enum class Notice {
    SHOWN,
    SNOOZED,
    SKIPPED,
}

internal sealed interface UpdateStatus {
    data object Unchecked : UpdateStatus

    data object UpToDate : UpdateStatus

    data class Newer(
        val release: PublishedRelease,
        val notice: Notice,
    ) : UpdateStatus
}

internal class UpdateChecking(
    private val state: UpdateState,
    private val updateCheck: UpdateCheck,
    private val clock: Clock,
    private val installed: ReleaseVersion,
) {
    var isAutomatic: Boolean by state::isAutomatic

    fun status(): UpdateStatus {
        val newer = state.latest?.takeIf { it.version > installed }
        return when {
            newer != null -> UpdateStatus.Newer(newer, noticeFor(newer))
            state.checkedAt != null -> UpdateStatus.UpToDate
            else -> UpdateStatus.Unchecked
        }
    }

    fun check(): CheckResult = updateCheck.check(installed).also { state.record(it, clock.instant()) }

    fun checkIfDue(): CheckResult? = if (isDue(clock.instant())) check() else null

    fun snooze(version: ReleaseVersion) = state.snooze(version, clock.instant())

    fun skip(version: ReleaseVersion) = state.skip(version)

    private fun isDue(now: Instant): Boolean {
        if (!state.isAutomatic) return false
        val attemptedAt = state.attemptedAt ?: return true
        val isClockBeforeAttempt = now.isBefore(attemptedAt)
        return isClockBeforeAttempt || !now.isBefore(attemptedAt + CHECK_INTERVAL)
    }

    private fun noticeFor(newer: PublishedRelease): Notice {
        val choices = state.choices
        return when {
            choices.offer(installed, newer, clock.instant()) != null -> Notice.SHOWN
            choices.skipped == newer.version -> Notice.SKIPPED
            else -> Notice.SNOOZED
        }
    }
}
