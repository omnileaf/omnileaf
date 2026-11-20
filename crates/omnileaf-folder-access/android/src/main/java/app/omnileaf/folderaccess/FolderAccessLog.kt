package app.omnileaf.folderaccess

import android.util.Log

private const val LOG_TAG = "Omnileaf/FolderAccess"

internal enum class FolderAccessEvent(
    val id: String,
) {
    DOCUMENT_LISTED_INCOMPLETE("document_listed_incomplete"),
}

internal enum class FolderAccessReason(
    val id: String,
) {
    MISSING_ID("missing_id"),
    MISSING_NAME("missing_name"),
    MISSING_ID_AND_NAME("missing_id_and_name"),
}

internal class FolderAccessLog(
    private val warnLine: (String) -> Unit,
) {
    fun warn(
        event: FolderAccessEvent,
        reason: FolderAccessReason,
    ) = warnLine("${event.id} reason=${reason.id}")
}

internal val FOLDER_ACCESS_LOG = FolderAccessLog { line -> Log.w(LOG_TAG, line) }

internal fun incompleteListing(
    hasId: Boolean,
    hasName: Boolean,
): FolderAccessReason? =
    when {
        !hasId && !hasName -> FolderAccessReason.MISSING_ID_AND_NAME
        !hasId -> FolderAccessReason.MISSING_ID
        !hasName -> FolderAccessReason.MISSING_NAME
        else -> null
    }
