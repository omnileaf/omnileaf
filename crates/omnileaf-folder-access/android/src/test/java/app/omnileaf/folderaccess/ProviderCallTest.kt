package app.omnileaf.folderaccess

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.time.Duration.Companion.seconds

private val BOUND = 15.seconds

class ProviderCallTest {
    private fun TestScope.providerScope() = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))

    @Test
    fun `answers with what the provider gave in time`() =
        runTest {
            val call = ProviderCall(run = { "listing" }, cancel = {})

            val answer = call.within(BOUND, providerScope())

            assertEquals("listing", answer)
        }

    @Test
    fun `cancels a call the provider leaves unanswered past the bound`() =
        runTest {
            var isCancelled = false
            val call = ProviderCall(run = { CompletableDeferred<String>().await() }, cancel = { isCancelled = true })

            val outcome = runCatching { call.within(BOUND, providerScope()) }

            assertTrue(outcome.exceptionOrNull() is CallTimedOut)
            assertTrue(isCancelled)
        }

    @Test
    fun `discards what the provider gives after the bound`() =
        runTest {
            val late = CompletableDeferred<String>()
            val discarded = mutableListOf<String>()
            val call =
                ProviderCall(
                    run = { withContext(NonCancellable) { late.await() } },
                    cancel = {},
                    discard = { discarded.add(it) },
                )
            val asking = async { runCatching { call.within(BOUND, providerScope()) } }
            delay(BOUND * 2)

            late.complete("descriptor")
            delay(1.seconds)

            assertTrue(asking.await().exceptionOrNull() is CallTimedOut)
            assertEquals(listOf("descriptor"), discarded)
        }

    @Test
    fun `passes on a failure the provider gave in time`() =
        runTest {
            val call = ProviderCall<String>(run = { throw SecurityException("grant revoked") }, cancel = {})

            val outcome = runCatching { call.within(BOUND, providerScope()) }

            assertTrue(outcome.exceptionOrNull() is SecurityException)
        }

    @Test
    fun `keeps what the provider gave in time`() =
        runTest {
            var isDiscarded = false
            val call = ProviderCall(run = { "descriptor" }, cancel = {}, discard = { isDiscarded = true })

            call.within(BOUND, providerScope())
            delay(1.seconds)

            assertFalse(isDiscarded)
        }
}
