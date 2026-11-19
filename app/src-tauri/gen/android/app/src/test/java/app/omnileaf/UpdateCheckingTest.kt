package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

private val INSTALLED = ReleaseVersion(0, 2, 0)
private val NOON: Instant = Instant.parse("2026-11-17T12:00:00Z")
private val NEWER = PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages")
private val NEWEST = PublishedRelease(ReleaseVersion(0, 4, 0), "Quicker search")

private fun feedReplyFor(release: PublishedRelease) =
    FeedReply(200, null, """{"tag_name":"v${release.version}","draft":false,"prerelease":false,"body":"${release.headline}"}""")

class UpdateCheckingTest {
    private val store = InMemoryUpdateStore()
    private val state = UpdateState(store)
    private val feed = FakeReleaseFeed()

    private fun checkingAt(now: Instant) = UpdateChecking(state, UpdateCheck(feed), Clock.fixed(now, ZoneOffset.UTC), INSTALLED)

    @Test
    fun `is unchecked before any check reaches github`() {
        state.record(CheckResult.Offline, NOON)

        val status = checkingAt(NOON).status()

        assertEquals(UpdateStatus.Unchecked, status)
    }

    @Test
    fun `is up to date once a check finds nothing newer`() {
        state.record(CheckResult.UpToDate, NOON)

        val status = checkingAt(NOON).status()

        assertEquals(UpdateStatus.UpToDate, status)
    }

    @Test
    fun `is up to date when the release found is already installed`() {
        state.record(CheckResult.Available(NEWER), NOON)

        val status = UpdateChecking(state, UpdateCheck(feed), Clock.fixed(NOON, ZoneOffset.UTC), NEWER.version).status()

        assertEquals(UpdateStatus.UpToDate, status)
    }

    @Test
    fun `shows a newer release found`() {
        state.record(CheckResult.Available(NEWER), NOON)

        val status = checkingAt(NOON).status()

        assertEquals(UpdateStatus.Newer(NEWER, Notice.SHOWN), status)
    }

    @Test
    fun `keeps a snoozed release out of sight for seven days`() {
        state.record(CheckResult.Available(NEWER), NOON)

        checkingAt(NOON).snooze(NEWER.version)

        val notices = listOf(Duration.ofDays(7).minusMillis(1), Duration.ofDays(7)).map { checkingAt(NOON + it).status() }
        assertEquals(listOf(UpdateStatus.Newer(NEWER, Notice.SNOOZED), UpdateStatus.Newer(NEWER, Notice.SHOWN)), notices)
    }

    @Test
    fun `keeps a skipped release out of sight`() {
        state.record(CheckResult.Available(NEWER), NOON)

        checkingAt(NOON).skip(NEWER.version)

        assertEquals(UpdateStatus.Newer(NEWER, Notice.SKIPPED), checkingAt(NOON + Duration.ofDays(30)).status())
    }

    @Test
    fun `shows a release newer than the one snoozed or skipped at once`() {
        state.record(CheckResult.Available(NEWER), NOON)
        checkingAt(NOON).snooze(NEWER.version)
        checkingAt(NOON).skip(NEWER.version)

        state.record(CheckResult.Available(NEWEST), NOON)

        assertEquals(UpdateStatus.Newer(NEWEST, Notice.SHOWN), checkingAt(NOON).status())
    }

    @Test
    fun `checks github for a release newer than the installed one and remembers it`() {
        feed.reply = feedReplyFor(NEWER)

        val result = checkingAt(NOON).check()

        assertEquals(CheckResult.Available(NEWER) to UpdateStatus.Newer(NEWER, Notice.SHOWN), result to checkingAt(NOON).status())
    }

    @Test
    fun `remembers when a check failed and how`() {
        feed.reply = FeedReply(500, null, "")

        val result = checkingAt(NOON).check()

        assertEquals(Triple(CheckResult.Failed(), NOON, UpdateOutcome.FAILED), Triple(result, state.attemptedAt, state.lastOutcome))
    }

    @Test
    fun `remembers the automatic check being turned on and off`() {
        val checking = checkingAt(NOON)

        val turns =
            listOf(true, false).map {
                checking.isAutomatic = it
                checkingAt(NOON).isAutomatic
            }

        assertEquals(listOf(true, false), turns)
    }

    @Test
    fun `never checks by itself while the automatic check is off`() {
        val result = checkingAt(NOON).checkIfDue()

        assertEquals(null to 0, result to feed.requests)
    }

    @Test
    fun `checks by itself when automatic and never tried before`() {
        checkingAt(NOON).isAutomatic = true

        val result = checkingAt(NOON).checkIfDue()

        assertEquals(CheckResult.UpToDate to 1, result to feed.requests)
    }

    @Test
    fun `checks by itself again only a full day after the last try`() {
        checkingAt(NOON).isAutomatic = true
        state.record(CheckResult.Offline, NOON)

        val results = listOf(Duration.ofHours(24).minusMillis(1), Duration.ofHours(24)).map { checkingAt(NOON + it).checkIfDue() }

        assertEquals(listOf(null, CheckResult.UpToDate) to 1, results to feed.requests)
    }

    @Test
    fun `checks by itself when the clock moved back before the last try`() {
        checkingAt(NOON).isAutomatic = true
        state.record(CheckResult.UpToDate, NOON)

        val result = checkingAt(NOON - Duration.ofMinutes(1)).checkIfDue()

        assertEquals(CheckResult.UpToDate to NOON - Duration.ofMinutes(1), result to state.attemptedAt)
    }
}
