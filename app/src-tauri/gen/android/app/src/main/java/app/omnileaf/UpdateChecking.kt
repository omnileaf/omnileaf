package app.omnileaf

import java.time.Clock

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

internal class ReleaseChecks(
    val manual: UpdateCheck,
    val daily: DailyUpdateCheck,
)

internal class UpdateChecking(
    private val state: UpdateState,
    private val checks: ReleaseChecks,
    private val clock: Clock,
    private val installed: ReleaseVersion,
) {
    val isAutomatic: Boolean get() = state.isAutomatic

    fun status(): UpdateStatus {
        val newer = state.latest?.takeIf { it.version > installed }
        return when {
            newer != null -> UpdateStatus.Newer(newer, noticeFor(newer))
            state.checkedAt != null -> UpdateStatus.UpToDate
            else -> UpdateStatus.Unchecked
        }
    }

    fun check(): CheckResult = checks.manual.check(installed).also { state.record(it, clock.instant()) }

    fun checkIfDue(): CheckResult? {
        if (!state.isAutomatic) return null
        return when (val run = checks.daily.runIfDue(clock.instant())) {
            is DailyRun.Checked -> run.result
            DailyRun.NotDue, DailyRun.VersionUnreadable -> null
        }
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
