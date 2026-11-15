package app.omnileaf

import android.os.SystemClock
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

internal class AppLockGate(
    private val activity: FragmentActivity,
) : DefaultLifecycleObserver {
    private val choices = AppLockChoices(activity.applicationContext)
    private val cover = LockCover(activity, onUnlock = ::ask)
    private var leftAt: Long? = null
    private var hasStarted = false
    private var isAsking = false

    fun watch() {
        val process = ProcessLifecycleOwner.get().lifecycle
        process.addObserver(this)
        activity.lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onDestroy(owner: LifecycleOwner) {
                    process.removeObserver(this@AppLockGate)
                }
            },
        )
    }

    override fun onStart(owner: LifecycleOwner) {
        if (!hasStarted) {
            hasStarted = true
            lockIfDue(awayFor = null)
            return
        }
        val left = leftAt ?: return
        leftAt = null
        lockIfDue((SystemClock.elapsedRealtime() - left).milliseconds)
    }

    override fun onStop(owner: LifecycleOwner) {
        if (!isAsking && !cover.isShown) {
            leftAt = SystemClock.elapsedRealtime()
        }
    }

    private fun lockIfDue(awayFor: Duration?) {
        val isFree = choices.isOn && !cover.isShown && !isAsking
        val words = choices.words?.takeIf { isFree } ?: return
        if (locksOnReturn(choices.lockAfter, awayFor)) {
            cover.show(words)
            ask()
        }
    }

    private fun ask() {
        val words = choices.words ?: return cover.hide()
        if (isAsking) return
        isAsking = true
        activity.askForScreenLock(words.prompt) { answer ->
            isAsking = false
            if (answer == ScreenLockAnswer.CONFIRMED) {
                cover.hide()
            }
        }
    }
}
