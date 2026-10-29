package app.omnileaf

private const val MEDIUM_CONTRAST_LEVEL = 0.5f
private const val HIGH_CONTRAST_LEVEL = 1f

internal enum class SystemContrast(
    val id: String,
    private val lowestLevel: Float,
) {
    STANDARD("standard", Float.NEGATIVE_INFINITY),
    MEDIUM("medium", MEDIUM_CONTRAST_LEVEL),
    HIGH("high", HIGH_CONTRAST_LEVEL),
    ;

    companion object {
        /** Android's Colour contrast setting writes 0, 0.5 and 1, and keeps values below 0 for less contrast than standard. */
        fun of(level: Float): SystemContrast = entries.last { level >= it.lowestLevel }
    }
}
