package app.omnileaf

internal enum class LockAfter(
    val id: String,
) {
    IMMEDIATELY("immediately"),
    ONE_MINUTE("oneMinute"),
    FIVE_MINUTES("fiveMinutes"),
    FIFTEEN_MINUTES("fifteenMinutes"),
    THIRTY_MINUTES("thirtyMinutes"),
    ONE_HOUR("oneHour"),
    ;

    companion object {
        val DEFAULT = ONE_MINUTE

        fun of(id: String?): LockAfter = entries.find { it.id == id } ?: DEFAULT
    }
}
