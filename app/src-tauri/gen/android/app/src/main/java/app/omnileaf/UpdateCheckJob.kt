package app.omnileaf

import android.app.job.JobParameters
import android.app.job.JobService
import java.time.Instant

class UpdateCheckJob : JobService() {
    @Volatile
    private var run: Thread? = null

    override fun onStartJob(params: JobParameters): Boolean {
        val state = UpdateState(PreferencesUpdateStore(this))
        if (!state.checksInBackground) {
            BackgroundUpdateCheck(SystemUpdateCheckJobs(this)).sync(state)
            return false
        }
        val check = NotifyingUpdateCheck(state, PackageInstalledRelease(this), UpdateNotifications(this))
        run = Thread({ runToEnd(check, params) }, "daily-update-check").apply { start() }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        run?.interrupt()
        return false
    }

    private fun runToEnd(
        check: NotifyingUpdateCheck,
        params: JobParameters,
    ) {
        try {
            check.run(Instant.now())
        } catch (_: InterruptedException) {
            return
        }
        jobFinished(params, false)
    }
}
