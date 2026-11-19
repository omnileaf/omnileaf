package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration
import java.time.Instant

private val NOW: Instant = Instant.parse("2026-11-17T09:00:00Z")
private val INSTALLED = ReleaseVersion(0, 2, 0)
private val FOUND = PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages")
private val NEWER = PublishedRelease(ReleaseVersion(0, 4, 0), headline = null)

class UpdateNoticeTest {
    private val state = UpdateState(MemoryUpdateStore())
    private val posted = MemoryPostedNotice()

    private fun found(release: PublishedRelease) = state.record(CheckResult.Available(release), NOW)

    private fun noticeAfterCheck(
        installed: ReleaseVersion = INSTALLED,
        now: Instant = NOW,
    ) = state.noticeAfterCheck(installed, now, posted)

    @Test
    fun `posts a release that has not been posted yet`() {
        found(FOUND)

        assertEquals(UpdateNotice.Post(FOUND), noticeAfterCheck())
    }

    @Test
    fun `keeps the notice for a release already showing`() {
        found(FOUND)
        posted.post(FOUND)

        assertEquals(UpdateNotice.Keep, noticeAfterCheck())
    }

    @Test
    fun `posts a notified release again once its notice is no longer showing`() {
        found(FOUND)
        posted.post(FOUND)

        posted.clearAll()

        assertEquals(UpdateNotice.Post(FOUND), noticeAfterCheck())
    }

    @Test
    fun `posts a release offered again after it was withdrawn`() {
        found(FOUND)
        posted.post(FOUND)
        state.record(CheckResult.UpToDate, NOW)
        posted.withdraw()

        found(FOUND)

        assertEquals(UpdateNotice.Post(FOUND), noticeAfterCheck())
    }

    @Test
    fun `posts a newer release over the one already showing`() {
        posted.post(FOUND)
        found(NEWER)

        assertEquals(UpdateNotice.Post(NEWER), noticeAfterCheck())
    }

    @Test
    fun `withdraws the notice once nothing newer is offered`() {
        posted.post(FOUND)
        state.record(CheckResult.UpToDate, NOW)

        assertEquals(UpdateNotice.Withdraw, noticeAfterCheck())
    }

    @Test
    fun `withdraws the notice once the release is installed`() {
        found(FOUND)
        posted.post(FOUND)

        assertEquals(UpdateNotice.Withdraw, noticeAfterCheck(installed = FOUND.version))
    }

    @Test
    fun `withdraws the notice for a skipped release`() {
        found(FOUND)
        posted.post(FOUND)
        state.skip(FOUND.version)

        assertEquals(UpdateNotice.Withdraw, noticeAfterCheck())
    }

    @Test
    fun `withdraws the notice while the release is snoozed`() {
        found(FOUND)
        state.snooze(FOUND.version, NOW - Duration.ofDays(6))

        assertEquals(UpdateNotice.Withdraw, noticeAfterCheck())
    }

    @Test
    fun `posts a release again once its seven day snooze has ended`() {
        found(FOUND)
        state.snooze(FOUND.version, NOW - Duration.ofDays(7))

        assertEquals(UpdateNotice.Post(FOUND), noticeAfterCheck())
    }

    @Test
    fun `posts a newer release while an older one is snoozed`() {
        found(NEWER)
        state.snooze(FOUND.version, NOW - Duration.ofDays(1))

        assertEquals(UpdateNotice.Post(NEWER), noticeAfterCheck())
    }

    @Test
    fun `keeps deciding from the release found while offline`() {
        found(FOUND)

        state.record(CheckResult.Offline, NOW.plusSeconds(60))

        assertEquals(UpdateNotice.Post(FOUND), noticeAfterCheck(now = NOW.plusSeconds(60)))
    }
}
