package app.omnileaf.folderaccess

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.Duration

internal class CallTimedOut(
    bound: Duration,
) : Exception("the documents provider didn't answer within $bound")

/** A documents provider call blocks until the provider answers, unless the provider honours its cancellation. */
internal class ProviderCall<T : Any>(
    val run: suspend () -> T,
    val cancel: () -> Unit,
    val discard: (T) -> Unit = {},
)

internal suspend fun <T : Any> ProviderCall<T>.within(
    bound: Duration,
    scope: CoroutineScope,
): T {
    val isTaken = AtomicBoolean(false)
    val answer =
        scope.async {
            val value = run()
            if (!isTaken.compareAndSet(false, true)) {
                discard(value)
                throw CancellationException("the documents provider answered after the bound")
            }
            value
        }
    return withTimeoutOrNull(bound) { answer.await() } ?: abandon(answer, isTaken, bound)
}

private suspend fun <T : Any> ProviderCall<T>.abandon(
    answer: Deferred<T>,
    isTaken: AtomicBoolean,
    bound: Duration,
): T {
    if (!isTaken.compareAndSet(false, true)) {
        return answer.await()
    }
    cancel()
    answer.cancel()
    throw CallTimedOut(bound)
}
