package app.omnileaf

private val UNSUPPORTED_SYNTAX = setOf('\'', '/', '#')
private val STRING_OPENERS = setOf('{', '[', ',', ':')
private val JSON_WHITESPACE = setOf(' ', '\t', '\n', '\r')

private class NestingScan(
    private val maxDepth: Int,
) {
    private var depth = 0
    private var previous: Char? = null
    private var isInString = false
    private var isEscaped = false

    fun accepts(char: Char): Boolean {
        if (!isInString) return acceptsStructure(char)
        readString(char)
        return true
    }

    private fun readString(char: Char) {
        when {
            isEscaped -> isEscaped = false
            char == '\\' -> isEscaped = true
            char == '"' -> isInString = false
        }
    }

    private fun acceptsStructure(char: Char): Boolean {
        if (char in JSON_WHITESPACE) return true
        val isAllowed =
            when (char) {
                in UNSUPPORTED_SYNTAX -> false
                '"' -> STRING_OPENERS.contains(previous).also { isInString = true }
                '[', '{' -> ++depth <= maxDepth
                ']', '}' -> --depth >= 0
                else -> true
            }
        previous = char
        return isAllowed
    }
}

/** Android's org.json recurses without a depth limit and accepts lenient syntax, so whatever this scan cannot follow is refused. */
internal fun isNestedWithin(
    json: String,
    maxDepth: Int,
): Boolean {
    val scan = NestingScan(maxDepth)
    return json.all(scan::accepts)
}
