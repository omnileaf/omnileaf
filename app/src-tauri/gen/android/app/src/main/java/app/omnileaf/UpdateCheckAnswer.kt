package app.omnileaf

import app.tauri.plugin.JSObject

internal sealed interface UpdateCheckAnswer {
    class Replied(
        val reply: JSObject,
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
        is CheckRun.Ended -> UpdateCheckAnswer.Replied(checkReply(run.result, status()))
        is CheckRun.Broke -> UpdateCheckAnswer.Refused("the update check broke", run.bug)
    }
