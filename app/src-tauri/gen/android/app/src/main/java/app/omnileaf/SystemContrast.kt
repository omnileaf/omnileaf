package app.omnileaf

internal enum class SystemContrast(
    val id: String,
    private val lowestLevel: Float,
) {
    STANDARD("standard", Float.NEGATIVE_INFINITY),
    MEDIUM("medium", 0.5f),
    HIGH("high", 1f),
    ;

    companion object {
        /** Android's Colour contrast setting writes 0, 0.5 and 1, and keeps values below 0 for less contrast than standard. */
        fun of(level: Float): SystemContrast = entries.last { level >= it.lowestLevel }
    }
}
