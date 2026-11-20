package app.omnileaf

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import java.time.Duration

private const val UPDATE_CHECK_JOB_ID = 7001
private const val BACKGROUND_WAKES_PER_DAILY_LIMIT = 2L
private val BACKGROUND_WAKE_PERIOD: Duration = LEAST_TIME_BETWEEN_CHECKS.dividedBy(BACKGROUND_WAKES_PER_DAILY_LIMIT)

internal interface UpdateCheckJobs {
    fun isScheduled(): Boolean

    fun schedule(period: Duration)

    fun cancel()
}

internal val UpdateState.checksInBackground: Boolean get() = isAutomatic && notifies

internal enum class UpdateCheckBuild {
    WITH_CHECK,
    WITHOUT_CHECK,
    ;

    companion object {
        val CURRENT: UpdateCheckBuild = if (BuildConfig.UPDATE_CHECK) WITH_CHECK else WITHOUT_CHECK
    }
}

internal class BackgroundUpdateCheck(
    private val jobs: UpdateCheckJobs,
    private val build: UpdateCheckBuild,
) {
    fun isWanted(state: UpdateState): Boolean = build == UpdateCheckBuild.WITH_CHECK && state.checksInBackground

    fun sync(state: UpdateState) {
        when {
            !isWanted(state) -> jobs.cancel()
            !jobs.isScheduled() -> jobs.schedule(BACKGROUND_WAKE_PERIOD)
        }
    }
}

internal class SystemUpdateCheckJobs(
    private val context: Context,
) : UpdateCheckJobs {
    private val scheduler: JobScheduler =
        requireNotNull(context.getSystemService(JobScheduler::class.java)) { "look up the JobScheduler system service" }

    override fun isScheduled(): Boolean = scheduler.getPendingJob(UPDATE_CHECK_JOB_ID) != null

    override fun schedule(period: Duration) {
        val job =
            JobInfo
                .Builder(UPDATE_CHECK_JOB_ID, ComponentName(context, UpdateCheckJob::class.java))
                .setPeriodic(period.toMillis())
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build()
        if (scheduler.schedule(job) != JobScheduler.RESULT_SUCCESS) APP_LOG.warn(LogEvent.UPDATE_CHECK_NOT_SCHEDULED, LogReason.REFUSED)
    }

    override fun cancel() = scheduler.cancel(UPDATE_CHECK_JOB_ID)
}
