package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration

class AutomaticCheckSwitchTest {
    private val state = UpdateState(MemoryUpdateStore())
    private val jobs = FakeUpdateCheckJobs()
    private val switch = AutomaticCheckSwitch(state, BackgroundUpdateCheck(jobs, UpdateCheckBuild.WITH_CHECK))

    @Test
    fun `remembers the automatic check being turned on and off`() {
        val turns =
            listOf(true, false).map {
                switch.turn(it)
                state.isAutomatic
            }

        assertEquals(listOf(true, false), turns)
    }

    @Test
    fun `starts the background check when turned on with notifications on`() {
        state.notifies = true

        switch.turn(true)

        assertEquals(Duration.ofHours(11), jobs.period)
    }

    @Test
    fun `stops the background check when turned off`() {
        state.notifies = true
        switch.turn(true)

        switch.turn(false)

        assertEquals(null, jobs.period)
    }
}
