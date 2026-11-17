package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.Executor

private val INSTALLED = ReleaseVersion(0, 2, 0)
private val NOON: Instant = Instant.parse("2026-11-17T12:00:00Z")

private class QueuedExecutor : Executor {
    private val queued = ArrayDeque<Runnable>()

    override fun execute(task: Runnable) {
        queued.addLast(task)
    }

    fun runAll() {
        while (queued.isNotEmpty()) queued.removeFirst().run()
    }
}

class UpdateCheckRunnerTest {
    private val state = UpdateState(InMemoryUpdateStore())
    private val feed = FakeReleaseFeed()
    private val executor = QueuedExecutor()

    private fun runnerOver(releases: ReleaseFeed) =
        UpdateCheckRunner(UpdateChecking(state, UpdateCheck(releases), Clock.fixed(NOON, ZoneOffset.UTC), INSTALLED), executor)

    @Test
    fun `asks github once for checks asked while one is still waiting`() {
        val runner = runnerOver(feed)
        val answers = mutableListOf<CheckRun>()

        repeat(2) { runner.check(answers::add) }
        executor.runAll()

        assertEquals(List(2) { CheckRun.Ended(CheckResult.UpToDate) } to 1, answers to feed.requests)
    }

    @Test
    fun `asks github again for a check asked after the last one ended`() {
        val runner = runnerOver(feed)
        val answers = mutableListOf<CheckRun>()

        repeat(2) {
            runner.check(answers::add)
            executor.runAll()
        }

        assertEquals(List(2) { CheckRun.Ended(CheckResult.UpToDate) } to 2, answers to feed.requests)
    }

    @Test
    fun `answers a check that broke and remembers no attempt`() {
        val bug = IllegalStateException("the network stack broke")
        val runner = runnerOver { throw bug }
        val answers = mutableListOf<CheckRun>()

        runner.check(answers::add)
        executor.runAll()

        assertEquals(listOf(CheckRun.Broke(bug)) to null, answers to state.attemptedAt)
    }

    @Test
    fun `checks when due on its own, without joining a manual check`() {
        val runner = runnerOver(feed)
        runner.checking.isAutomatic = true
        val answers = mutableListOf<CheckRun>()

        runner.check(answers::add)
        runner.checkIfDue(answers::add)
        executor.runAll()

        assertEquals(listOf(CheckRun.Ended(CheckResult.UpToDate), CheckRun.Ended(null)) to 1, answers to feed.requests)
    }

    @Test
    fun `answers a due check that broke`() {
        val bug = IllegalStateException("the network stack broke")
        val runner = runnerOver { throw bug }
        runner.checking.isAutomatic = true
        val answers = mutableListOf<CheckRun>()

        runner.checkIfDue(answers::add)
        executor.runAll()

        assertEquals(listOf(CheckRun.Broke(bug)), answers)
    }
}
