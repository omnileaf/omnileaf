package app.omnileaf.folderaccess

import android.content.Intent

internal const val READ_GRANT = Intent.FLAG_GRANT_READ_URI_PERMISSION
internal const val READ_WRITE_GRANT = READ_GRANT or Intent.FLAG_GRANT_WRITE_URI_PERMISSION

/** Some pickers grant read access only, and persisting a write grant they never gave throws a `SecurityException`. */
internal fun takeTreeGrant(take: (flags: Int) -> Unit) {
    try {
        take(READ_WRITE_GRANT)
    } catch (_: SecurityException) {
        take(READ_GRANT)
    }
}
