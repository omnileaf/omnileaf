package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration
import java.time.Instant

private val NOW: Instant = Instant.parse("2026-11-17T09:00:00Z")
private val INSTALLED = ReleaseVersion(0, 2, 0)
private val FOUND = PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages")
private const val FOUND_REPLY = """{"tag_name":"v0.3.0","draft":false,"prerelease":false,"body":"Smoother pages"}"""
private const val UP_TO_DATE_REPLY = """{"tag_name":"v0.2.0","draft":false,"prerelease":false,"body":null}"""

class NotifyingUpdateCheckTest {
    private val state = UpdateState(MemoryUpdateStore())
    private val notices = MemoryUpdateNotices()
    private var installed: ReleaseVersion? = INSTALLED
    private var reply = FOUND_REPLY
    private var requests = 0

    private fun run() {
        val feed =
            ReleaseFeed {
                requests += 1
                FeedReply(200, null, reply)
            }
        NotifyingUpdateCheck(state, { installed }, notices) { feed }.run(NOW)
    }

    @Test
    fun `makes no request while update notices cannot be shown`() {
        notices.isAllowed = false

        run()

        assertEquals(0 to false, requests to notices.isShowing(FOUND.version))
    }

    @Test
    fun `posts the release the check found`() {
        run()

        assertEquals(1 to true, requests to notices.isShowing(FOUND.version))
    }

    @Test
    fun `withdraws the notice once the check finds nothing newer`() {
        notices.post(FOUND)
        reply = UP_TO_DATE_REPLY

        run()

        assertEquals(1 to false, notices.withdrawals to notices.isShowing(FOUND.version))
    }

    @Test
    fun `keeps the notice showing the release found again`() {
        notices.post(FOUND)

        run()

        assertEquals(0 to true, notices.withdrawals to notices.isShowing(FOUND.version))
    }

    @Test
    fun `leaves the notice as it is while the installed version cannot be read`() {
        notices.post(FOUND)
        reply = UP_TO_DATE_REPLY
        installed = null

        run()

        assertEquals(0 to true, notices.withdrawals to notices.isShowing(FOUND.version))
    }

    @Test
    fun `posts a release again once its snooze ends, between daily checks`() {
        state.record(CheckResult.Available(FOUND), NOW - Duration.ofHours(1))
        state.snooze(FOUND.version, NOW - Duration.ofDays(8))

        run()

        assertEquals(0 to true, requests to notices.isShowing(FOUND.version))
    }
}
