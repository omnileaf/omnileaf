package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

private val NOW: Instant = Instant.parse("2026-11-17T09:00:00Z")
private val NAMED = ReleaseVersion(0, 3, 0)
private val NO_CHOICES = UpdateChoices(skipped = null, snooze = null)

class UpdateNoticeActionTest {
    private val state = UpdateState(MemoryUpdateStore())
    private val choices = UpdateNoticeChoices(state, MemoryUpdateNotices())

    @Test
    fun `skip this version skips the version the notice named`() {
        choices.answer(UpdateNoticeAction.SKIP.intentAction, "0.3.0", NOW)

        assertEquals(UpdateChoices(skipped = NAMED, snooze = null), state.choices)
    }

    @Test
    fun `swiping the notice away snoozes the version it named`() {
        choices.answer(UpdateNoticeAction.SNOOZE.intentAction, "0.3.0", NOW)

        assertEquals(UpdateChoices(skipped = null, snooze = Snooze(NAMED, NOW)), state.choices)
    }

    @Test
    fun `ignores an action it does not know`() {
        choices.answer("android.intent.action.VIEW", "0.3.0", NOW)

        assertEquals(NO_CHOICES, state.choices)
    }

    @Test
    fun `ignores a notice whose version cannot be read`() {
        val unreadable = listOf(null, "", "v0.3.0", "0.3")

        unreadable.forEach { choices.answer(UpdateNoticeAction.SKIP.intentAction, it, NOW) }

        assertEquals(NO_CHOICES, state.choices)
    }
}
