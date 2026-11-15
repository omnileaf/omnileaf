package app.omnileaf

import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

private const val HANG_GUARD_SECONDS = 60L

class ScheduledWatchdogTest {
    @Test
    fun `raises the alarm once the limit has passed`() {
        val raised = CountDownLatch(1)

        ScheduledWatchdog.arm(Duration.ZERO) { raised.countDown() }

        assertTrue(raised.await(HANG_GUARD_SECONDS, TimeUnit.SECONDS))
    }
}
