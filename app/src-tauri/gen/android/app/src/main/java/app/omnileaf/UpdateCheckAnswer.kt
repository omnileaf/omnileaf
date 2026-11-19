package app.omnileaf

import app.tauri.plugin.JSObject
import java.io.IOException

internal sealed interface UpdateCheckAnswer {
    class Replied(
        val reply: JSObject,
        val failure: IOException?,
    ) : UpdateCheckAnswer

    data class Refused(
        val message: String,
        val cause: RuntimeException,
    ) : UpdateCheckAnswer
}

internal fun checkAnswer(
    run: CheckRun,
    status: () -> JSObject,
): UpdateCheckAnswer =
    when (run) {
        is CheckRun.Ended -> UpdateCheckAnswer.Replied(checkReply(run.result, status()), run.result.failure())
        is CheckRun.Broke -> UpdateCheckAnswer.Refused("the update check broke", run.bug)
    }

private fun CheckResult?.failure(): IOException? = (this as? CheckResult.Failed)?.cause
