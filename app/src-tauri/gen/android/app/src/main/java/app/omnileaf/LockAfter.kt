package app.omnileaf

import kotlin.time.Duration
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes

internal enum class LockAfter(
    val id: String,
    val delay: Duration,
) {
    IMMEDIATELY("immediately", Duration.ZERO),
    ONE_MINUTE("oneMinute", 1.minutes),
    FIVE_MINUTES("fiveMinutes", 5.minutes),
    FIFTEEN_MINUTES("fifteenMinutes", 15.minutes),
    THIRTY_MINUTES("thirtyMinutes", 30.minutes),
    ONE_HOUR("oneHour", 1.hours),
    ;

    companion object {
        val DEFAULT = ONE_MINUTE

        fun of(id: String?): LockAfter = entries.find { it.id == id } ?: DEFAULT
    }
}
