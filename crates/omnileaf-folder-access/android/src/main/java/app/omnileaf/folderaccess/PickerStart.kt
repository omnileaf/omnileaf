package app.omnileaf.folderaccess

private const val PATH_SEPARATOR = '/'
private const val VOLUME_SEPARATOR = ':'

/** The external storage provider writes a folder's document id as its volume, a colon and its path below the volume. */
internal fun parentDocumentId(documentId: String): String =
    when {
        documentId.contains(PATH_SEPARATOR) -> documentId.substringBeforeLast(PATH_SEPARATOR)
        documentId.contains(VOLUME_SEPARATOR) -> documentId.substringBefore(VOLUME_SEPARATOR) + VOLUME_SEPARATOR
        else -> documentId
    }
