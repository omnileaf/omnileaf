package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration
import java.time.Instant

private val NOW: Instant = Instant.parse("2026-11-17T09:00:00Z")
private val INSTALLED = ReleaseVersion(0, 2, 0)
private val FOUND = PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages")
private val NEWER = PublishedRelease(ReleaseVersion(0, 4, 0), headline = null)

class UpdateNoticeChoicesTest {
    private val state = UpdateState(MemoryUpdateStore())
    private val posted = MemoryPostedNotice()
    private val choices = UpdateNoticeChoices(state, posted)

    private fun posts(release: PublishedRelease) {
        state.record(CheckResult.Available(release), NOW)
        posted.post(release)
    }

    private fun noticeAfterCheck(now: Instant) = state.noticeAfterCheck(INSTALLED, now, posted)

    @Test
    fun `skipping a version withdraws its notice for good`() {
        posts(FOUND)

        choices.skip(FOUND.version)

        val later = NOW + Duration.ofDays(30)
        assertEquals(UpdateNotice.Withdraw to 1, noticeAfterCheck(later) to posted.withdrawals)
    }

    @Test
    fun `skipping a version still posts a newer one`() {
        posts(FOUND)
        choices.skip(FOUND.version)

        state.record(CheckResult.Available(NEWER), NOW)

        assertEquals(UpdateNotice.Post(NEWER), noticeAfterCheck(NOW))
    }

    @Test
    fun `skipping an older version keeps the newer notice showing`() {
        posts(NEWER)

        choices.skip(FOUND.version)

        assertEquals(UpdateNotice.Keep to 0, noticeAfterCheck(NOW) to posted.withdrawals)
    }

    @Test
    fun `snoozing a version withdraws its notice for seven days`() {
        posts(FOUND)

        choices.snooze(FOUND.version, NOW)

        val sixDaysOn = NOW + Duration.ofDays(6)
        assertEquals(UpdateNotice.Withdraw to 1, noticeAfterCheck(sixDaysOn) to posted.withdrawals)
    }

    @Test
    fun `snoozing a version posts it again when its seven days end`() {
        posts(FOUND)

        choices.snooze(FOUND.version, NOW)

        val sevenDaysOn = NOW + Duration.ofDays(7)
        assertEquals(UpdateNotice.Post(FOUND), noticeAfterCheck(sevenDaysOn))
    }

    @Test
    fun `snoozing an older version keeps the newer notice showing`() {
        posts(NEWER)

        choices.snooze(FOUND.version, NOW)

        assertEquals(UpdateNotice.Keep to 0, noticeAfterCheck(NOW) to posted.withdrawals)
    }
}
