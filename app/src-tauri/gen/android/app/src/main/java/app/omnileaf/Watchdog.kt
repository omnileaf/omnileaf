package app.omnileaf

import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

internal fun interface Disarm {
    fun disarm()
}

internal fun interface Watchdog {
    fun arm(
        limit: Duration,
        onExpiry: () -> Unit,
    ): Disarm
}

private val ALARMS: ScheduledExecutorService =
    Executors.newSingleThreadScheduledExecutor { task -> Thread(task, "release-check-watchdog").apply { isDaemon = true } }

internal object ScheduledWatchdog : Watchdog {
    override fun arm(
        limit: Duration,
        onExpiry: () -> Unit,
    ): Disarm {
        val alarm = ALARMS.schedule(Runnable { onExpiry() }, limit.toNanos(), TimeUnit.NANOSECONDS)
        return Disarm { alarm.cancel(false) }
    }
}
