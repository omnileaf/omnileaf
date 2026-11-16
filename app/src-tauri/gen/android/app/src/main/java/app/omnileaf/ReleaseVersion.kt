package app.omnileaf

private const val TAG_PREFIX = "v"
private const val NUMBER_COUNT = 3
private const val NUMBER = """0|[1-9]\d*"""
private const val IDENTIFIER = """(?:$NUMBER|\d*[A-Za-z-][0-9A-Za-z-]*)"""
private const val PRE_RELEASE = """$IDENTIFIER(?:\.$IDENTIFIER)*"""
private val VERSION = Regex("""($NUMBER)\.($NUMBER)\.($NUMBER)(?:-($PRE_RELEASE))?""")
private val PRE_RELEASE_PATTERN = Regex(PRE_RELEASE)

internal data class ReleaseVersion(
    val major: Int,
    val minor: Int,
    val patch: Int,
    val preRelease: String? = null,
) : Comparable<ReleaseVersion> {
    init {
        require(major >= 0 && minor >= 0 && patch >= 0) { "version numbers are never negative: $major.$minor.$patch" }
        require(preRelease == null || PRE_RELEASE_PATTERN.matches(preRelease)) { "not a semver pre-release: $preRelease" }
    }

    override fun compareTo(other: ReleaseVersion): Int {
        val byNumbers = compareValuesBy(this, other, { it.major }, { it.minor }, { it.patch })
        if (byNumbers != 0) return byNumbers
        return comparePreReleases(preRelease, other.preRelease)
    }

    override fun toString(): String = listOfNotNull("$major.$minor.$patch", preRelease).joinToString("-")

    companion object {
        fun parse(text: String): ReleaseVersion? {
            val parts = VERSION.matchEntire(text)?.groupValues?.drop(1) ?: return null
            val numbers = parts.take(NUMBER_COUNT).map { it.toIntOrNull() ?: return null }
            return ReleaseVersion(numbers[0], numbers[1], numbers[2], parts.last().ifEmpty { null })
        }

        fun fromStableTag(tag: String): ReleaseVersion? {
            val text = tag.removePrefix(TAG_PREFIX).takeIf { it != tag } ?: return null
            return parse(text)?.takeIf { it.preRelease == null }
        }
    }
}

private fun comparePreReleases(
    left: String?,
    right: String?,
): Int =
    when {
        left == null && right == null -> 0
        left == null -> 1
        right == null -> -1
        else -> compareIdentifiers(left.split('.'), right.split('.'))
    }

private fun compareIdentifiers(
    left: List<String>,
    right: List<String>,
): Int {
    val firstDifference = left.zip(right).map { (l, r) -> compareIdentifier(l, r) }.firstOrNull { it != 0 }
    return firstDifference ?: left.size.compareTo(right.size)
}

private fun compareIdentifier(
    left: String,
    right: String,
): Int {
    val isLeftNumber = left.isNumeric()
    val isRightNumber = right.isNumeric()
    return when {
        isLeftNumber && isRightNumber -> compareValuesBy(left, right, { it.length }, { it })
        isLeftNumber -> -1
        isRightNumber -> 1
        else -> left.compareTo(right)
    }
}

private fun String.isNumeric(): Boolean = all { it in '0'..'9' }
