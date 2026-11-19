package app.omnileaf

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.time.Clock
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private val CHECKS: ExecutorService =
    Executors.newSingleThreadExecutor { task -> Thread(task, "update-check").apply { isDaemon = true } }

@InvokeArg
class ChosenVersion {
    lateinit var version: String
}

@InvokeArg
class AutomaticCheck {
    var automatic: Boolean = false
}

@TauriPlugin
class UpdatesPlugin(
    activity: Activity,
) : Plugin(activity) {
    private val runner: UpdateCheckRunner? =
        ReleaseVersion.parse(BuildConfig.VERSION_NAME)?.let { installed ->
            val checking =
                UpdateChecking(
                    UpdateState(PreferencesUpdateStore(activity.applicationContext)),
                    UpdateCheck(GitHubReleaseFeed(installed)),
                    Clock.systemUTC(),
                    installed,
                )
            UpdateCheckRunner(checking, CHECKS)
        }

    @Command
    fun status(invoke: Invoke) {
        val checking = runnerFor(invoke)?.checking ?: return
        invoke.resolve(checking.statusNow())
    }

    @Command
    fun check(invoke: Invoke) {
        val runner = runnerFor(invoke) ?: return
        runner.check { invoke.answer(it, runner.checking) }
    }

    @Command
    fun checkIfDue(invoke: Invoke) {
        val runner = runnerFor(invoke) ?: return
        runner.checkIfDue { invoke.answer(it, runner.checking) }
    }

    @Command
    fun setAutomatic(invoke: Invoke) {
        val checking = runnerFor(invoke)?.checking ?: return
        checking.isAutomatic = invoke.parseArgs(AutomaticCheck::class.java).automatic
        invoke.resolve(checking.statusNow())
    }

    @Command
    fun snooze(invoke: Invoke) {
        val checking = runnerFor(invoke)?.checking ?: return
        val version = chosenVersion(invoke) ?: return
        checking.snooze(version)
        invoke.resolve(checking.statusNow())
    }

    @Command
    fun skip(invoke: Invoke) {
        val checking = runnerFor(invoke)?.checking ?: return
        val version = chosenVersion(invoke) ?: return
        checking.skip(version)
        invoke.resolve(checking.statusNow())
    }

    private fun runnerFor(invoke: Invoke): UpdateCheckRunner? {
        if (runner == null) invoke.reject("the installed version ${BuildConfig.VERSION_NAME} is not a release version")
        return runner
    }

    private fun chosenVersion(invoke: Invoke): ReleaseVersion? {
        val text = invoke.parseArgs(ChosenVersion::class.java).version
        val version = ReleaseVersion.parse(text)
        if (version == null) invoke.reject("not a release version: $text")
        return version
    }
}

private fun UpdateChecking.statusNow() = statusReply(status(), isAutomatic)

private fun Invoke.answer(
    run: CheckRun,
    checking: UpdateChecking,
) = when (val answer = checkAnswer(run, checking::statusNow)) {
    is UpdateCheckAnswer.Replied -> {
        answer.failure?.let { APP_LOG.warn(LogEvent.UPDATE_CHECK_FAILED, updateCheckFailure(it)) }
        resolve(answer.reply)
    }

    is UpdateCheckAnswer.Refused -> {
        reject(answer.message, answer.cause)
    }
}
