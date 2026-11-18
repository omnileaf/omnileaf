package app.omnileaf

import java.time.Instant

private const val AUTOMATIC = "automatic"
private const val NOTIFIES = "notifies"
private const val SKIPPED_VERSION = "skippedVersion"
private const val SNOOZED_VERSION = "snoozedVersion"
private const val SNOOZED_AT = "snoozedAt"
private const val LATEST_VERSION = "latestVersion"
private const val LATEST_HEADLINE = "latestHeadline"
private const val CHECKED_AT = "checkedAt"
private const val ATTEMPTED_AT = "attemptedAt"
private const val LAST_OUTCOME = "lastOutcome"
private const val NOTIFIED_VERSION = "notifiedVersion"

internal interface UpdateStore {
    fun snapshot(): Map<String, String>

    fun write(values: Map<String, String?>)
}

internal enum class UpdateOutcome {
    UP_TO_DATE,
    AVAILABLE,
    OFFLINE,
    RATE_LIMITED,
    FAILED,
}

internal class UpdateState(
    private val store: UpdateStore,
) {
    var isAutomatic: Boolean
        get() = store.snapshot()[AUTOMATIC].toBoolean()
        set(value) = store.write(mapOf(AUTOMATIC to value.toString()))
    var notifies: Boolean
        get() = store.snapshot()[NOTIFIES].toBoolean()
        set(value) = store.write(mapOf(NOTIFIES to value.toString()))
    val choices: UpdateChoices get() = store.snapshot().let { UpdateChoices(it.version(SKIPPED_VERSION), it.snooze()) }
    val latest: PublishedRelease? get() = store.snapshot().latest()
    val checkedAt: Instant? get() = store.snapshot().instant(CHECKED_AT)
    val lastOutcome: UpdateOutcome?
        get() {
            val stored = store.snapshot()[LAST_OUTCOME]
            return UpdateOutcome.entries.find { it.name == stored }
        }
    val notifiedVersion: ReleaseVersion? get() = store.snapshot().version(NOTIFIED_VERSION)
    val attemptedAt: Instant? get() = store.snapshot().instant(ATTEMPTED_AT)

    fun skip(version: ReleaseVersion) = store.write(mapOf(SKIPPED_VERSION to version.toString()))

    fun snooze(
        version: ReleaseVersion,
        now: Instant,
    ) {
        store.write(mapOf(SNOOZED_VERSION to version.toString(), SNOOZED_AT to now.toEpochMilli().toString()))
    }

    fun markNotified(version: ReleaseVersion) = store.write(mapOf(NOTIFIED_VERSION to version.toString()))

    fun markAttempted(now: Instant) = store.write(mapOf(ATTEMPTED_AT to now.toEpochMilli().toString()))

    fun record(
        result: CheckResult,
        now: Instant,
    ) {
        val reached =
            when (result) {
                CheckResult.UpToDate -> latestValues(null, now)
                is CheckResult.Available -> latestValues(result.release, now)
                CheckResult.Offline, CheckResult.RateLimited, is CheckResult.Failed -> emptyMap()
            }
        store.write(reached + mapOf(ATTEMPTED_AT to now.toEpochMilli().toString(), LAST_OUTCOME to outcomeOf(result).name))
    }

    private fun latestValues(
        release: PublishedRelease?,
        now: Instant,
    ): Map<String, String?> =
        mapOf(
            LATEST_VERSION to release?.version?.toString(),
            LATEST_HEADLINE to release?.headline,
            CHECKED_AT to now.toEpochMilli().toString(),
        )
}

private fun Map<String, String>.version(key: String): ReleaseVersion? = get(key)?.let(ReleaseVersion::parse)

private fun Map<String, String>.instant(key: String): Instant? = get(key)?.toLongOrNull()?.let(Instant::ofEpochMilli)

private fun Map<String, String>.latest(): PublishedRelease? = version(LATEST_VERSION)?.let { PublishedRelease(it, get(LATEST_HEADLINE)) }

private fun Map<String, String>.snooze(): Snooze? {
    val version = version(SNOOZED_VERSION) ?: return null
    val snoozedAt = instant(SNOOZED_AT) ?: return null
    return Snooze(version, snoozedAt)
}

private fun outcomeOf(result: CheckResult): UpdateOutcome =
    when (result) {
        CheckResult.UpToDate -> UpdateOutcome.UP_TO_DATE
        is CheckResult.Available -> UpdateOutcome.AVAILABLE
        CheckResult.Offline -> UpdateOutcome.OFFLINE
        CheckResult.RateLimited -> UpdateOutcome.RATE_LIMITED
        is CheckResult.Failed -> UpdateOutcome.FAILED
    }
