package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.InterruptedIOException
import java.net.UnknownHostException
import java.time.Duration
import java.time.Instant
import java.util.concurrent.FutureTask

private val INSTALLED = ReleaseVersion(0, 2, 0)
private val NOW: Instant = Instant.parse("2026-11-17T09:00:00Z")
private val NO_RELEASE_YET = FeedReply(404, null, "")
private const val NEWER_RELEASE = """{"tag_name":"v0.3.0","draft":false,"prerelease":false,"body":"Smoother pages"}"""
private val STOPPING_FEED =
    ReleaseFeed {
        Thread.currentThread().interrupt()
        throw InterruptedIOException("the release check was interrupted")
    }

private class CountingFeed(
    private val reply: () -> FeedReply,
) : ReleaseFeed {
    var requests = 0
        private set

    override fun fetchLatest(): FeedReply {
        requests += 1
        return reply()
    }
}

class DailyUpdateCheckTest {
    private val state = UpdateState(MemoryUpdateStore())
    private val feed = CountingFeed { NO_RELEASE_YET }
    private val feedsMadeFor = mutableListOf<ReleaseVersion>()

    private fun dailyCheck(
        installed: InstalledRelease = InstalledRelease { INSTALLED },
        feed: ReleaseFeed = this.feed,
    ) = DailyUpdateCheck(state, installed) { version -> feed.also { feedsMadeFor += version } }

    private fun lastAttemptedAt(time: Instant) = state.record(CheckResult.UpToDate, time)

    @Test
    fun `asks github for the installed version when it has never asked`() {
        val run = dailyCheck().runIfDue(NOW)

        assertEquals(
            listOf(DailyRun.Checked(CheckResult.UpToDate), 1, listOf(INSTALLED), NOW),
            listOf(run, feed.requests, feedsMadeFor, state.attemptedAt),
        )
    }

    @Test
    fun `does not ask again within 22 hours of the last attempt`() {
        lastAttemptedAt(NOW - Duration.ofHours(22) + Duration.ofSeconds(1))

        val run = dailyCheck().runIfDue(NOW)

        assertEquals(DailyRun.NotDue to 0, run to feed.requests)
    }

    @Test
    fun `asks again once 22 hours have passed since the last attempt`() {
        lastAttemptedAt(NOW - Duration.ofHours(22))

        val run = dailyCheck().runIfDue(NOW)

        assertEquals(DailyRun.Checked(CheckResult.UpToDate) to 1, run to feed.requests)
    }

    @Test
    fun `asks again when the last attempt is in the future after a clock change`() {
        lastAttemptedAt(NOW + Duration.ofHours(1))

        val run = dailyCheck().runIfDue(NOW)

        assertEquals(DailyRun.Checked(CheckResult.UpToDate) to NOW, run to state.attemptedAt)
    }

    @Test
    fun `counts an attempt that could not reach github`() {
        dailyCheck(feed = { throw UnknownHostException("api.github.com") }).runIfDue(NOW)

        val laterRun = dailyCheck().runIfDue(NOW + Duration.ofHours(1))

        assertEquals(DailyRun.NotDue to UpdateOutcome.OFFLINE, laterRun to state.lastOutcome)
    }

    @Test
    fun `keeps a newer release it found for the banner`() {
        dailyCheck(feed = { FeedReply(200, null, NEWER_RELEASE) }).runIfDue(NOW)

        assertEquals(PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages"), state.latest)
    }

    @Test
    fun `makes no request when the installed version cannot be read`() {
        val run = dailyCheck(installed = { null }).runIfDue(NOW)

        assertEquals(Triple(DailyRun.VersionUnreadable, 0, null), Triple(run, feed.requests, state.attemptedAt))
    }

    @Test
    fun `counts a check that was stopped part way as the day's attempt`() {
        assertThrows(InterruptedException::class.java) { dailyCheck(feed = STOPPING_FEED).runIfDue(NOW) }

        assertEquals(NOW to null, state.attemptedAt to state.lastOutcome)
    }

    @Test
    fun `does not ask again when a stopped check is started over`() {
        assertThrows(InterruptedException::class.java) { dailyCheck(feed = STOPPING_FEED).runIfDue(NOW) }

        val rerun = dailyCheck().runIfDue(NOW + Duration.ofSeconds(30))

        assertEquals(DailyRun.NotDue to 0, rerun to feed.requests)
    }

    @Test
    fun `asks only once when two checks start together`() {
        val secondRun = FutureTask { dailyCheck().runIfDue(NOW) }
        val second = Thread(secondRun)
        val holding =
            InstalledRelease {
                second.start()
                while (second.isAlive && second.state != Thread.State.WAITING) Thread.onSpinWait()
                INSTALLED
            }

        dailyCheck(installed = holding).runIfDue(NOW)

        assertEquals(DailyRun.NotDue to 1, secondRun.get() to feed.requests)
    }
}
