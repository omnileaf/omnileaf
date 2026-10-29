package app.omnileaf.folderaccess

import java.io.FileNotFoundException

private const val PERMISSION_DENIED = "permissionDenied"
private const val NOT_FOUND = "notFound"
private const val TIMED_OUT = "timedOut"
private const val INCOMPLETE = "incomplete"
private const val READ_ONLY_GRANT = "readOnlyGrant"
private const val DELETE_REFUSED = "deleteRefused"

internal data class Refusal(
    val message: String?,
    val code: String?,
)

internal fun refusalOf(error: Exception): Refusal =
    when (error) {
        is CallTimedOut -> Refusal(error.message, TIMED_OUT)
        is ListingIncomplete -> Refusal(error.message, INCOMPLETE)
        is ReadOnlyGrant -> Refusal(error.message, READ_ONLY_GRANT)
        is DeleteRefused -> Refusal(error.message, DELETE_REFUSED)
        is UnsupportedOperationException -> Refusal(error.message, DELETE_REFUSED)
        is SecurityException -> Refusal(error.message, PERMISSION_DENIED)
        is FileNotFoundException -> Refusal(error.message, NOT_FOUND)
        else -> Refusal(error.message ?: error.toString(), null)
    }
