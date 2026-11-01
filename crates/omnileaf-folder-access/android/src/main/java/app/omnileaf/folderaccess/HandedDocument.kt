package app.omnileaf.folderaccess

import android.content.Context
import android.net.Uri
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.FileNotFoundException

private const val CONTENT_SCHEME = "content"

internal class HandedDocument(
    val descriptor: ParcelFileDescriptor,
    val name: String?,
)

internal class HandedDocuments(
    context: Context,
) {
    private val resolver = context.contentResolver

    fun open(
        uri: Uri,
        signal: CancellationSignal,
    ): HandedDocument {
        requireContentScheme(uri.toString(), uri.scheme)
        val descriptor = resolver.openFileDescriptor(uri, "r", signal) ?: throw FileNotFoundException("open $uri")
        var isNamed = false
        try {
            val handed = HandedDocument(descriptor, displayNameOf(uri, signal))
            isNamed = true
            return handed
        } finally {
            if (!isNamed) {
                descriptor.close()
            }
        }
    }

    /** A provider may leave a document unnamed, by answering with no cursor, no row or no name column. */
    private fun displayNameOf(
        document: Uri,
        signal: CancellationSignal,
    ): String? =
        resolver.query(document, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null, signal)?.use { cursor ->
            val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (column >= 0 && cursor.moveToFirst()) cursor.getString(column) else null
        }
}

/** A request hands over a document by its `content://` address, and any other scheme would reach the app's own files. */
internal fun requireContentScheme(
    uri: String,
    scheme: String?,
) {
    if (scheme != CONTENT_SCHEME) {
        throw SecurityException("$uri isn't a content address")
    }
}
