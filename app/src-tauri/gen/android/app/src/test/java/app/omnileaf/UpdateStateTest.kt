package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

private val CHECKED: Instant = Instant.parse("2026-11-16T09:00:00Z")
private val FOUND = PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages")

class UpdateStateTest {
    private val store = MemoryUpdateStore()
    private val state = UpdateState(store)

    @Test
    fun `checks and notifies only once turned on`() {
        val before = state.isAutomatic to state.notifies

        state.isAutomatic = true
        state.notifies = true

        assertEquals((false to false) to (true to true), before to (state.isAutomatic to state.notifies))
    }

    @Test
    fun `remembers a release found and when`() {
        state.record(CheckResult.Available(FOUND), CHECKED)

        assertEquals(Triple(FOUND, CHECKED, UpdateOutcome.AVAILABLE), Triple(UpdateState(store).latest, state.checkedAt, state.lastOutcome))
    }

    @Test
    fun `forgets the release found once up to date`() {
        state.record(CheckResult.Available(FOUND), CHECKED)

        state.record(CheckResult.UpToDate, CHECKED.plusSeconds(60))

        assertEquals(
            Triple(null, CHECKED.plusSeconds(60), UpdateOutcome.UP_TO_DATE),
            Triple(state.latest, state.checkedAt, state.lastOutcome),
        )
    }

    @Test
    fun `keeps the release found while offline but notes the outcome`() {
        state.record(CheckResult.Available(FOUND), CHECKED)

        state.record(CheckResult.Offline, CHECKED.plusSeconds(60))

        assertEquals(Triple(FOUND, CHECKED, UpdateOutcome.OFFLINE), Triple(state.latest, state.checkedAt, state.lastOutcome))
    }

    @Test
    fun `notes when every check was tried, reached or not`() {
        val outcomes = listOf(CheckResult.Offline, CheckResult.RateLimited, CheckResult.Failed(), CheckResult.UpToDate)

        val attempts =
            outcomes.mapIndexed { minute, result ->
                state.record(result, CHECKED.plusSeconds(60L * minute))
                state.attemptedAt to state.lastOutcome
            }

        val expectedOutcomes = listOf(UpdateOutcome.OFFLINE, UpdateOutcome.RATE_LIMITED, UpdateOutcome.FAILED, UpdateOutcome.UP_TO_DATE)
        assertEquals(expectedOutcomes.mapIndexed { minute, outcome -> CHECKED.plusSeconds(60L * minute) to outcome }, attempts)
    }

    @Test
    fun `notes an attempt before its outcome is known`() {
        state.record(CheckResult.UpToDate, CHECKED)

        state.markAttempted(CHECKED.plusSeconds(60))

        assertEquals(
            Triple(CHECKED.plusSeconds(60), CHECKED, UpdateOutcome.UP_TO_DATE),
            Triple(state.attemptedAt, state.checkedAt, state.lastOutcome),
        )
    }

    @Test
    fun `keeps the last reached check time while rate limited or failing`() {
        state.record(CheckResult.UpToDate, CHECKED)

        state.record(CheckResult.RateLimited, CHECKED.plusSeconds(60))
        state.record(CheckResult.Failed(), CHECKED.plusSeconds(120))

        assertEquals(CHECKED, state.checkedAt)
    }

    @Test
    fun `reads nothing from values it cannot understand`() {
        store.write(mapOf("checkedAt" to "soon", "lastOutcome" to "GONE", "latestVersion" to "v0.3", "snoozedVersion" to "0.3.0"))

        val read = listOf(state.checkedAt, state.lastOutcome, state.latest, state.choices.snooze)

        assertEquals(listOf(null, null, null, null), read)
    }

    @Test
    fun `remembers the skipped and snoozed versions`() {
        state.skip(ReleaseVersion(0, 3, 0))
        state.snooze(ReleaseVersion(0, 4, 0), CHECKED)

        val expected = UpdateChoices(ReleaseVersion(0, 3, 0), Snooze(ReleaseVersion(0, 4, 0), snoozedAt = CHECKED))
        assertEquals(expected, state.choices)
    }
}
