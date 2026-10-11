package app.omnileaf.folderaccess

import android.database.Cursor
import android.provider.DocumentsContract.Document
import app.tauri.Logger
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject

private const val MISSING_COLUMN = -1

internal val LISTED_COLUMNS =
    arrayOf(
        Document.COLUMN_DOCUMENT_ID,
        Document.COLUMN_DISPLAY_NAME,
        Document.COLUMN_MIME_TYPE,
        Document.COLUMN_SIZE,
        Document.COLUMN_LAST_MODIFIED,
    )

/** Sends a row missing its id or name on as one, so the library reads it as unreadable rather than gone. */
internal fun listedDocuments(cursor: Cursor): JSArray {
    val columns = ListedColumns(cursor)
    val documents = JSArray()
    while (cursor.moveToNext()) {
        val document = columns.read(cursor)
        if (!document.has("id") || !document.has("name")) {
            Logger.warn(Logger.tags("FolderAccess"), "a documents provider listed a document without its id or name")
        }
        documents.put(document)
    }
    return documents
}

/** A documents provider may leave out any column it was asked for but the id and name. */
private class ListedColumns(
    cursor: Cursor,
) {
    private val id = cursor.getColumnIndexOrThrow(Document.COLUMN_DOCUMENT_ID)
    private val name = cursor.getColumnIndexOrThrow(Document.COLUMN_DISPLAY_NAME)
    private val mimeType = cursor.getColumnIndex(Document.COLUMN_MIME_TYPE)
    private val size = cursor.getColumnIndex(Document.COLUMN_SIZE)
    private val lastModified = cursor.getColumnIndex(Document.COLUMN_LAST_MODIFIED)

    fun read(cursor: Cursor): JSObject =
        JSObject()
            .put("id", cursor.stringAt(id))
            .put("name", cursor.stringAt(name))
            .put("mimeType", cursor.stringAt(mimeType))
            .put("size", cursor.longAt(size))
            .put("lastModified", cursor.longAt(lastModified))
}

private fun Cursor.holdsValueAt(column: Int): Boolean = column != MISSING_COLUMN && !isNull(column)

private fun Cursor.stringAt(column: Int): String? = if (holdsValueAt(column)) getString(column) else null

private fun Cursor.longAt(column: Int): Long? = if (holdsValueAt(column)) getLong(column) else null
