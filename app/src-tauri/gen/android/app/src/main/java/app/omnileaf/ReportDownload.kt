package app.omnileaf

import android.annotation.SuppressLint
import android.content.ContentResolver
import android.content.ContentValues
import android.os.Environment
import android.provider.MediaStore
import java.io.IOException

internal const val MIN_DOWNLOADS_SDK = 29

internal fun interface DownloadWriter {
    fun write(
        name: String,
        mime: String,
        text: String,
    ): String
}

internal fun saveToDownloads(
    sdkInt: Int,
    writer: DownloadWriter,
    name: String,
    text: String,
): String {
    if (sdkInt < MIN_DOWNLOADS_SDK) {
        throw UnsupportedOperationException("saving to Downloads needs Android 10 or newer")
    }
    return writer.write(name, "text/plain", text)
}

/**
 * MediaStore renames a file that would collide, so the name it kept is what the person finds in Downloads.
 * The Downloads collection exists from Android 10, and `saveToDownloads` refuses older phones before it writes.
 */
@SuppressLint("NewApi")
internal class MediaStoreDownloads(
    private val resolver: ContentResolver,
) : DownloadWriter {
    override fun write(
        name: String,
        mime: String,
        text: String,
    ): String {
        val details =
            ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
        val uri =
            resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, details)
                ?: throw IOException("the Downloads collection refused the new file")
        try {
            val stream = resolver.openOutputStream(uri) ?: throw IOException("open the new file in Downloads")
            stream.use { it.write(text.toByteArray()) }
            resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            return keptName(uri) ?: name
        } catch (failure: IOException) {
            resolver.delete(uri, null, null)
            throw failure
        }
    }

    private fun keptName(uri: android.net.Uri): String? =
        resolver.query(uri, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
}
