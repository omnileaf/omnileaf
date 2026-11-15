package app.omnileaf

internal enum class HourClock(
    val id: String,
) {
    TWELVE_HOUR("twelveHour"),
    TWENTY_FOUR_HOUR("twentyFourHour"),
    ;

    companion object {
        fun of(isTwentyFourHour: Boolean): HourClock = if (isTwentyFourHour) TWENTY_FOUR_HOUR else TWELVE_HOUR
    }
}
