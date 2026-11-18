package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration

private class FakeUpdateCheckJobs : UpdateCheckJobs {
    var period: Duration? = null
        private set
    var schedules = 0
        private set

    override fun isScheduled(): Boolean = period != null

    override fun schedule(period: Duration) {
        this.period = period
        schedules += 1
    }

    override fun cancel() {
        period = null
    }
}

class BackgroundUpdateCheckTest {
    private val jobs = FakeUpdateCheckJobs()
    private val background = BackgroundUpdateCheck(jobs)

    private fun stateWith(
        isAutomatic: Boolean,
        notifies: Boolean,
    ) = UpdateState(MemoryUpdateStore()).apply {
        this.isAutomatic = isAutomatic
        this.notifies = notifies
    }

    @Test
    fun `wakes every 11 hours so a run that comes too early is retried within the day`() {
        background.sync(stateWith(isAutomatic = true, notifies = true))

        assertEquals(Duration.ofHours(11), jobs.period)
    }

    @Test
    fun `stops checking in the background once either switch is off`() {
        val switches = listOf(true to false, false to true, false to false)

        val periods =
            switches.map { (isAutomatic, notifies) ->
                background.sync(stateWith(isAutomatic = true, notifies = true))
                background.sync(stateWith(isAutomatic, notifies))
                jobs.period
            }

        assertEquals(listOf(null, null, null), periods)
    }

    @Test
    fun `keeps the scheduled check so its day does not start over`() {
        val state = stateWith(isAutomatic = true, notifies = true)

        background.sync(state)
        background.sync(state)

        assertEquals(1, jobs.schedules)
    }
}
