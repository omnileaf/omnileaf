package app.omnileaf

import java.time.Duration

internal class FakeUpdateCheckJobs : UpdateCheckJobs {
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
