package app.omnileaf

private const val HEADLINE_LENGTH = 300
private val HEADING = Regex("""^#+(?:\s|$)""")
private val LINE_MARKS = Regex("""^[*-]+(?:\s+|$)""")
private val AREA_LABEL = Regex("""^\*\*[^*]+:\*\*\s*""")

internal fun releaseHeadline(body: String?): String? {
    val lines = body?.lineSequence()?.map(String::trim)?.filterNot { HEADING.containsMatchIn(it) } ?: return null
    val line = lines.map(::withoutMarks).firstOrNull { it.isNotEmpty() } ?: return null
    return line.takeWhole(HEADLINE_LENGTH)
}

private fun String.takeWhole(length: Int): String {
    val cut = take(length)
    return if (cut.lastOrNull()?.isHighSurrogate() == true) cut.dropLast(1) else cut
}

private fun withoutMarks(line: String): String =
    line
        .replaceFirst(LINE_MARKS, "")
        .replaceFirst(AREA_LABEL, "")
        .trim()
