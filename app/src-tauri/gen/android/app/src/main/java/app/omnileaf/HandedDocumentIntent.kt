package app.omnileaf

import android.content.Intent
import android.net.Uri
import androidx.core.content.IntentCompat

private const val CONTENT_ADDRESS = "content://"

internal data class IncomingIntent(
    val action: String?,
    val data: String?,
    val stream: String?,
)

internal fun IncomingIntent.handedDocument(): String? {
    val address =
        when (action) {
            Intent.ACTION_VIEW -> data
            Intent.ACTION_SEND -> stream
            else -> null
        }
    return address?.takeIf { it.startsWith(CONTENT_ADDRESS, ignoreCase = true) }
}

internal fun Intent.handedDocument(): String? =
    IncomingIntent(
        action = action,
        data = dataString,
        stream = IntentCompat.getParcelableExtra(this, Intent.EXTRA_STREAM, Uri::class.java)?.toString(),
    ).handedDocument()
