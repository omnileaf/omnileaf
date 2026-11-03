package app.omnileaf.folderaccess

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import androidx.core.net.toUri
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

private const val FOLDER_PICKED = "folderPicked"

/** A cloud provider may fetch a folder's listing over the network before it answers. */
private val LISTING_BOUND = 15.seconds

/** A cloud provider may download the whole document before it hands over a descriptor. */
private val OPENING_BOUND = 30.seconds

/**
 * A cloud provider may reach its server before it deletes a document, and a call still running when the bound elapses
 * can finish afterwards, because `deleteDocument` takes no cancellation signal.
 */
private val DELETING_BOUND = 20.seconds

@InvokeArg
public class DocumentArgs {
    public lateinit var tree: String
    public var document: String? = null
}

@InvokeArg
public class PickArgs {
    public var near: String? = null
}

@InvokeArg
public class HandedArgs {
    public lateinit var uri: String
}

@InvokeArg
public class GrantArgs {
    public lateinit var uri: String
}

@TauriPlugin
public class FolderAccessPlugin
    @JvmOverloads
    constructor(
        activity: Activity,
        dispatcher: CoroutineDispatcher = Dispatchers.IO,
    ) : Plugin(activity) {
        private val scope = CoroutineScope(SupervisorJob() + dispatcher)
        private val host = activity
        private val trees = DocumentTrees(activity)
        private val handedDocuments = HandedDocuments(activity)
        private var isPicking = false

        @Command
        public fun pickFolder(invoke: Invoke) {
            if (isPicking) {
                return invoke.reject("The folder picker is already open.")
            }
            val near = invoke.parseArgs(PickArgs::class.java).near
            isPicking = true
            try {
                startActivityForResult(invoke, folderPickerIntent(near?.toUri()), FOLDER_PICKED)
            } catch (error: ActivityNotFoundException) {
                isPicking = false
                rejectPicker(invoke, error)
            } catch (error: IllegalStateException) {
                isPicking = false
                rejectPicker(invoke, error)
            }
        }

        @ActivityCallback
        public fun folderPicked(
            invoke: Invoke,
            result: ActivityResult,
        ) {
            isPicking = false
            val tree = result.data?.data
            if (result.resultCode != Activity.RESULT_OK || tree == null) {
                return invoke.resolve()
            }
            answer(invoke) {
                withinBound(LISTING_BOUND, discard = { trees.release(tree) }) { signal -> trees.keep(tree, signal) }
            }
        }

        @Command
        public fun listDocuments(invoke: Invoke) {
            val args = invoke.parseArgs(DocumentArgs::class.java)
            answer(invoke) {
                withinBound(LISTING_BOUND) { signal -> trees.children(args.tree.toUri(), args.document, signal) }
            }
        }

        @Command
        public fun openDocument(invoke: Invoke) {
            val args = invoke.parseArgs(DocumentArgs::class.java)
            val document = requireNotNull(args.document) { "open a document without naming it" }
            answer(invoke) {
                val descriptor =
                    withinBound(OPENING_BOUND, discard = ParcelFileDescriptor::close) { signal ->
                        trees.open(args.tree.toUri(), document, signal)
                    }
                handOver(descriptor)
            }
        }

        @Command
        public fun openHandedDocument(invoke: Invoke) {
            val args = invoke.parseArgs(HandedArgs::class.java)
            answer(invoke) {
                val handed =
                    withinBound(OPENING_BOUND, discard = { it.descriptor.close() }) { signal ->
                        handedDocuments.open(args.uri.toUri(), signal)
                    }
                handOver(handed.descriptor).put("name", handed.name)
            }
        }

        @Command
        public fun deleteDocument(invoke: Invoke) {
            val args = invoke.parseArgs(DocumentArgs::class.java)
            val document = requireNotNull(args.document) { "delete a document without naming it" }
            answer(invoke) {
                withinBound(DELETING_BOUND) { _ -> trees.delete(args.tree.toUri(), document) }
                null
            }
        }

        @Command
        public fun showFolder(invoke: Invoke) {
            val args = invoke.parseArgs(DocumentArgs::class.java)
            answer(invoke) {
                host.startActivity(folderViewIntent(args.tree.toUri(), args.document))
                null
            }
        }

        @Command
        public fun persistedGrants(invoke: Invoke) {
            answer(invoke) { trees.persistedGrants() }
        }

        @Command
        public fun releaseGrant(invoke: Invoke) {
            val args = invoke.parseArgs(GrantArgs::class.java)
            answer(invoke) {
                trees.release(args.uri.toUri())
                null
            }
        }

        private suspend fun <T : Any> withinBound(
            bound: Duration,
            discard: (T) -> Unit = {},
            run: suspend (CancellationSignal) -> T,
        ): T {
            val signal = CancellationSignal()
            return ProviderCall(run = { run(signal) }, cancel = signal::cancel, discard = discard).within(bound, scope)
        }

        /** Tauri's Rust side blocks until the plugin answers, so even an exception nobody expected must answer it. */
        @Suppress("TooGenericExceptionCaught")
        private fun answer(
            invoke: Invoke,
            work: suspend () -> JSObject?,
        ) {
            scope.launch {
                try {
                    val reply = work()
                    if (reply == null) invoke.resolve() else invoke.resolve(reply)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    val refusal = refusalOf(error)
                    invoke.reject(refusal.message, refusal.code)
                }
            }
        }
    }

private fun rejectPicker(
    invoke: Invoke,
    error: RuntimeException,
) {
    invoke.reject(error.message ?: error.toString())
}

/** A picker grants a tree only the access its intent asks for, so it is asked for write access beside read. */
private fun folderPickerIntent(near: Uri?): Intent {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(READ_WRITE_GRANT)
    val start = near?.let(::pickerStartOf) ?: return intent
    return intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, start)
}

/** The picker opens inside the folder it is given, so a lost folder is offered by opening the folder that held it. */
private fun pickerStartOf(lost: Uri): Uri? {
    val authority = lost.authority ?: return null
    val id = runCatching { DocumentsContract.getTreeDocumentId(lost) }.getOrNull() ?: return null
    return DocumentsContract.buildDocumentUri(authority, parentDocumentId(id))
}

/** The Files app opens a folder when it is handed the folder's document address with the directory type. */
private fun folderViewIntent(
    tree: Uri,
    folder: String?,
): Intent {
    val id = folder ?: DocumentsContract.getTreeDocumentId(tree)
    return Intent(Intent.ACTION_VIEW)
        .setDataAndType(DocumentsContract.buildDocumentUriUsingTree(tree, id), DocumentsContract.Document.MIME_TYPE_DIR)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
}

/** `detachFd` gives up the descriptor without closing it, so the Rust side that reads the reply owns it. */
private fun handOver(descriptor: ParcelFileDescriptor): JSObject = JSObject().put("fd", descriptor.detachFd())
