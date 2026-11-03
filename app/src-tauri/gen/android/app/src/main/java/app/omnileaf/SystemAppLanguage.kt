package app.omnileaf

internal fun firstLanguageTag(languageTags: String): String? = languageTags.substringBefore(',').trim().ifEmpty { null }
