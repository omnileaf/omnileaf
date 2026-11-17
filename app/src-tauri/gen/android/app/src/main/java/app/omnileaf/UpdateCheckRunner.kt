package app.omnileaf

import java.util.concurrent.Executor

internal sealed interface CheckRun {
    data class Ended(
        val result: CheckResult?,
    ) : CheckRun

    data class Broke(
        val bug: RuntimeException,
    ) : CheckRun
}

internal class UpdateCheckRunner(
    val checking: UpdateChecking,
    private val executor: Executor,
) {
    private val waitingOnCheck = mutableListOf<(CheckRun) -> Unit>()

    fun check(answer: (CheckRun) -> Unit) {
        val isFirstWaiting =
            synchronized(waitingOnCheck) {
                waitingOnCheck += answer
                waitingOnCheck.size == 1
            }
        if (!isFirstWaiting) return
        executor.execute {
            val run = attempt(checking::check)
            val answers = synchronized(waitingOnCheck) { waitingOnCheck.toList().also { waitingOnCheck.clear() } }
            answers.forEach { it(run) }
        }
    }

    fun checkIfDue(answer: (CheckRun) -> Unit) {
        executor.execute { answer(attempt(checking::checkIfDue)) }
    }
}

@Suppress("TooGenericExceptionCaught")
private fun attempt(check: () -> CheckResult?): CheckRun =
    try {
        CheckRun.Ended(check())
    } catch (bug: RuntimeException) {
        CheckRun.Broke(bug)
    }
