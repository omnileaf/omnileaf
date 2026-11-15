package app.omnileaf

import java.time.Duration
import java.time.Instant

private const val SNOOZE_DAYS = 7L

private val SNOOZE_LENGTH: Duration = Duration.ofDays(SNOOZE_DAYS)

internal data class PublishedRelease(
    val version: ReleaseVersion,
    val headline: String?,
)

internal data class Snooze(
    val version: ReleaseVersion,
    val snoozedAt: Instant,
) {
    fun covers(
        release: ReleaseVersion,
        now: Instant,
    ): Boolean {
        val isClockBeforeSnooze = now.isBefore(snoozedAt)
        val hasEnded = !now.isBefore(snoozedAt + SNOOZE_LENGTH)
        return release == version && !isClockBeforeSnooze && !hasEnded
    }
}

internal data class UpdateChoices(
    val skipped: ReleaseVersion?,
    val snooze: Snooze?,
) {
    fun offer(
        installed: ReleaseVersion,
        latest: PublishedRelease?,
        now: Instant,
    ): PublishedRelease? =
        latest?.takeIf {
            it.version > installed && it.version != skipped && snooze?.covers(it.version, now) != true
        }
}
