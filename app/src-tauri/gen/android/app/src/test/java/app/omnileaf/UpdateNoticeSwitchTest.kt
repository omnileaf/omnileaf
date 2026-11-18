package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

private val NOW: Instant = Instant.parse("2026-11-18T09:00:00Z")
private val INSTALLED = ReleaseVersion(0, 2, 0)
private val FOUND = PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages")

class UpdateNoticeSwitchTest {
    private val state = UpdateState(MemoryUpdateStore()).apply { isAutomatic = true }
    private val jobs = FakeUpdateCheckJobs()
    private val notices = MemoryUpdateNotices()
    private var installed = INSTALLED
    private val switch = UpdateNoticeSwitch(state, BackgroundUpdateCheck(jobs, UpdateCheckBuild.WITH_CHECK), notices) { installed }

    private fun posts(release: PublishedRelease) {
        state.record(CheckResult.Available(release), NOW)
        notices.post(release)
    }

    @Test
    fun `turning on starts the daily check in the background`() {
        switch.settle(UpdateNoticeTurning.TURNED_ON)

        assertEquals(true to true, switch.isOn to jobs.isScheduled())
    }

    @Test
    fun `a refused or blocked answer leaves notices off and schedules nothing`() {
        val answers = listOf(UpdateNoticeTurning.REFUSED, UpdateNoticeTurning.BLOCKED)

        val outcomes = answers.map { switch.settle(it) to (switch.isOn to jobs.isScheduled()) }

        assertEquals(answers.map { it to (false to false) }, outcomes)
    }

    @Test
    fun `turning off stops the background check and withdraws the notice`() {
        switch.settle(UpdateNoticeTurning.TURNED_ON)
        posts(FOUND)

        switch.turnOff()

        assertEquals(listOf(false, false, false), listOf(switch.isOn, jobs.isScheduled(), notices.isShowing(FOUND.version)))
    }

    @Test
    fun `starting the app schedules a check that was lost`() {
        state.notifies = true

        switch.resync(NOW)

        assertEquals(true, jobs.isScheduled())
    }

    @Test
    fun `starting the app withdraws a notice for the version now installed`() {
        switch.settle(UpdateNoticeTurning.TURNED_ON)
        posts(FOUND)

        installed = FOUND.version
        switch.resync(NOW)

        assertEquals(false, notices.isShowing(FOUND.version))
    }

    @Test
    fun `starting the app keeps a notice that is still news`() {
        switch.settle(UpdateNoticeTurning.TURNED_ON)
        posts(FOUND)

        switch.resync(NOW)

        assertEquals(true, notices.isShowing(FOUND.version))
    }
}
