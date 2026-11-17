package app.omnileaf

import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes

internal enum class LockAfter(
    val id: String,
    val delay: Duration,
) {
    IMMEDIATELY("immediately", Duration.ZERO),
    ONE_MINUTE("oneMinute", 1.minutes),
    FIVE_MINUTES("fiveMinutes", 5.minutes),
    THIRTY_MINUTES("thirtyMinutes", 30.minutes),
    ;

    companion object {
        val DEFAULT = ONE_MINUTE

        private val SHORTER_FOR_RETIRED =
            mapOf(
                "fifteenMinutes" to FIVE_MINUTES,
                "oneHour" to THIRTY_MINUTES,
            )

        fun of(id: String?): LockAfter = entries.find { it.id == id } ?: SHORTER_FOR_RETIRED[id] ?: DEFAULT
    }
}
