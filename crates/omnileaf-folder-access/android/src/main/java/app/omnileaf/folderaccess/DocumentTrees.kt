package app.omnileaf.folderaccess

import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.database.Cursor
import android.net.Uri
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import kotlinx.coroutines.CompletableDeferred
import java.io.FileNotFoundException

internal class ListingIncomplete(
    listing: Uri,
) : Exception("the documents provider is still loading $listing")

internal class ListingFailed(
    message: String,
) : Exception(message)

internal class DocumentTrees(
    context: Context,
) {
    private val resolver = context.contentResolver
    private val storageNames = StorageNames(context)

    fun keep(
        tree: Uri,
        signal: CancellationSignal,
    ): JSObject {
        resolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        var isDescribed = false
        try {
            val described = describe(tree, signal)
            isDescribed = true
            return described
        } finally {
            if (!isDescribed) {
                release(tree)
            }
        }
    }

    suspend fun children(
        tree: Uri,
        folder: String?,
        signal: CancellationSignal,
    ): JSObject {
        val folderId = folder ?: DocumentsContract.getTreeDocumentId(tree)
        val listing = DocumentsContract.buildChildDocumentsUriUsingTree(tree, folderId)
        while (true) {
            query(listing, LISTED_COLUMNS, signal).use { cursor ->
                cursor.failIfTheProviderDid()
                if (!cursor.isLoading()) {
                    return JSObject().put("documents", listedDocuments(cursor))
                }
                awaitMore(cursor, listing)
            }
        }
    }

    fun open(
        tree: Uri,
        document: String,
        signal: CancellationSignal,
    ): ParcelFileDescriptor {
        val uri = DocumentsContract.buildDocumentUriUsingTree(tree, document)
        return resolver.openFileDescriptor(uri, "r", signal) ?: throw FileNotFoundException("open $uri")
    }

    fun persistedGrants(): JSObject {
        val grants =
            resolver.persistedUriPermissions
                .filter { it.isReadPermission && DocumentsContract.isTreeUri(it.uri) }
                .map { JSObject().put("uri", it.uri.toString()).put("persistedAtMs", it.persistedTime) }
        return JSObject().put("grants", JSArray(grants))
    }

    fun release(tree: Uri) {
        resolver.releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    private fun describe(
        tree: Uri,
        signal: CancellationSignal,
    ): JSObject {
        val documentId = DocumentsContract.getTreeDocumentId(tree)
        val document = DocumentsContract.buildDocumentUriUsingTree(tree, documentId)
        return JSObject()
            .put("uri", tree.toString())
            .put("documentId", documentId)
            .put("name", nameOf(document, signal))
            .put("storageName", storageNames.of(tree, documentId))
    }

    private fun nameOf(
        document: Uri,
        signal: CancellationSignal,
    ): String =
        query(document, arrayOf(Document.COLUMN_DISPLAY_NAME), signal).use { cursor ->
            if (!cursor.moveToFirst()) {
                throw FileNotFoundException("name $document")
            }
            cursor.getString(0) ?: throw FileNotFoundException("name $document")
        }

    /** A documents provider answers a query for a document it can't find with no cursor at all. */
    private fun query(
        uri: Uri,
        columns: Array<String>,
        signal: CancellationSignal,
    ): Cursor = resolver.query(uri, columns, null, null, null, signal) ?: throw FileNotFoundException("query $uri")

    /** A documents provider still loading a listing notifies the cursor's notification URI once it holds more. */
    private suspend fun awaitMore(
        cursor: Cursor,
        listing: Uri,
    ) {
        val notifying = cursor.notificationUri ?: throw ListingIncomplete(listing)
        val changed = CompletableDeferred<Unit>()
        val observer =
            object : ContentObserver(null) {
                override fun onChange(selfChange: Boolean) {
                    changed.complete(Unit)
                }
            }
        resolver.registerContentObserver(notifying, true, observer)
        try {
            changed.await()
        } finally {
            resolver.unregisterContentObserver(observer)
        }
    }
}

/** A documents provider flags a listing it is still fetching in the cursor's extras. */
private fun Cursor.isLoading(): Boolean = extras.getBoolean(DocumentsContract.EXTRA_LOADING, false)

/** A documents provider reports a listing it failed to fetch in the cursor's extras, with whatever rows it had. */
private fun Cursor.failIfTheProviderDid() {
    extras.getString(DocumentsContract.EXTRA_ERROR)?.let { throw ListingFailed(it) }
}
