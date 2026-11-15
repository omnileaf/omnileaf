package app.omnileaf

import androidx.activity.OnBackPressedCallback
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

internal class AppLockGate(
    private val activity: FragmentActivity,
) : DefaultLifecycleObserver {
    private val choices = AppLockChoices(activity.applicationContext)
    private val state = AppLocks.state
    private val cover = LockCover(activity, onUnlock = ::ask)
    private var keepsBackOut: OnBackPressedCallback? = null
    private var isAsking = false

    val isCovering: Boolean
        get() = cover.isShown

    fun watch() {
        activity.followRecentsChoice(choices)
        activity.lifecycle.addObserver(this)
    }

    override fun onStart(owner: LifecycleOwner) {
        if (state.returned(choices.isOn, choices.lockAfter)) {
            showCover()
            ask()
        } else {
            hideCover()
        }
    }

    override fun onStop(owner: LifecycleOwner) {
        state.left(isStillInTheApp = activity.isChangingConfigurations || isAsking)
    }

    private fun showCover() {
        if (cover.isShown) return
        cover.show(choices.wordsToShow)
        keepsBackOut =
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    activity.moveTaskToBack(true)
                }
            }.also { activity.onBackPressedDispatcher.addCallback(activity, it) }
    }

    private fun hideCover() {
        cover.hide()
        keepsBackOut?.remove()
        keepsBackOut = null
    }

    private fun ask() {
        if (isAsking || !state.isCovered) return
        isAsking = true
        activity.askForScreenLock(choices.wordsToShow.prompt) { answer ->
            isAsking = false
            when (answer) {
                ScreenLockAnswer.CONFIRMED -> {
                    state.unlocked()
                    hideCover()
                }

                ScreenLockAnswer.NO_SCREEN_LOCK -> {
                    cover.sayNoScreenLock(choices.wordsToShow)
                }

                ScreenLockAnswer.REFUSED -> {
                    Unit
                }
            }
        }
    }
}
