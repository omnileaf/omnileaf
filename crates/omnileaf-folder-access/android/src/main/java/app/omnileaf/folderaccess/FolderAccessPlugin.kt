package app.omnileaf.folderaccess

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
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
import java.io.FileNotFoundException
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

private const val PERMISSION_DENIED = "permissionDenied"
private const val NOT_FOUND = "notFound"
private const val TIMED_OUT = "timedOut"
private const val INCOMPLETE = "incomplete"
private const val FOLDER_PICKED = "folderPicked"

/** A cloud provider may fetch a folder's listing over the network before it answers. */
private val LISTING_BOUND = 15.seconds

/** A cloud provider may download the whole document before it hands over a descriptor. */
private val OPENING_BOUND = 30.seconds

@InvokeArg
public class DocumentArgs {
    public lateinit var tree: String
    public var document: String? = null
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
        private val trees = DocumentTrees(activity)
        private var isPicking = false

        @Command
        public fun pickFolder(invoke: Invoke) {
            if (isPicking) {
                return invoke.reject("The folder picker is already open.")
            }
            isPicking = true
            try {
                startActivityForResult(invoke, Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), FOLDER_PICKED)
            } catch (error: ActivityNotFoundException) {
                pickerFailed(invoke, error)
            } catch (error: IllegalStateException) {
                pickerFailed(invoke, error)
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

        private fun pickerFailed(
            invoke: Invoke,
            error: RuntimeException,
        ) {
            isPicking = false
            invoke.reject(error.message ?: error.toString())
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
                } catch (error: CallTimedOut) {
                    invoke.reject(error.message, TIMED_OUT)
                } catch (error: ListingIncomplete) {
                    invoke.reject(error.message, INCOMPLETE)
                } catch (error: SecurityException) {
                    invoke.reject(error.message, PERMISSION_DENIED)
                } catch (error: FileNotFoundException) {
                    invoke.reject(error.message, NOT_FOUND)
                } catch (error: Exception) {
                    invoke.reject(error.message ?: error.toString())
                }
            }
        }
    }

/** `detachFd` gives up the descriptor without closing it, so the Rust side that reads the reply owns it. */
private fun handOver(descriptor: ParcelFileDescriptor): JSObject = JSObject().put("fd", descriptor.detachFd())
