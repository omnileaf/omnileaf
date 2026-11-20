package app.omnileaf

import android.app.Activity
import app.tauri.Logger
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
    private val context = activity.applicationContext
    private val state = UpdateState(PreferencesUpdateStore(context))
    private val clock = Clock.systemUTC()
    private val installedRelease = PackageInstalledRelease(context)
    private val automatic = AutomaticCheckSwitch(state, BackgroundUpdateCheck(SystemUpdateCheckJobs(context)))
    private val choices = UpdateNoticeChoices(state, UpdateNotifications(context))
    private val runner: UpdateCheckRunner? =
        installedRelease.version()?.let { installed ->
            val checks =
                ReleaseChecks(
                    UpdateCheck(GitHubReleaseFeed(installed)),
                    DailyUpdateCheck(state, installedRelease) { GitHubReleaseFeed(it) },
                )
            UpdateCheckRunner(UpdateChecking(state, checks, clock, installed), CHECKS)
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
        automatic.turn(invoke.parseArgs(AutomaticCheck::class.java).automatic)
        invoke.resolve(checking.statusNow())
    }

    @Command
    fun snooze(invoke: Invoke) {
        val checking = runnerFor(invoke)?.checking ?: return
        val version = chosenVersion(invoke) ?: return
        choices.snooze(version, clock.instant())
        invoke.resolve(checking.statusNow())
    }

    @Command
    fun skip(invoke: Invoke) {
        val checking = runnerFor(invoke)?.checking ?: return
        val version = chosenVersion(invoke) ?: return
        choices.skip(version)
        invoke.resolve(checking.statusNow())
    }

    private fun runnerFor(invoke: Invoke): UpdateCheckRunner? {
        if (runner == null) invoke.reject("the installed version is not a release version")
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
        answer.failure?.let { Logger.error("the update check failed", it) }
        resolve(answer.reply)
    }

    is UpdateCheckAnswer.Refused -> {
        reject(answer.message, answer.cause)
    }
}
