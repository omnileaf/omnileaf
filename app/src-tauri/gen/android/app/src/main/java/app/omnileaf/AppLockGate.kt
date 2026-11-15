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
    private val keepsBackOut =
        object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                activity.moveTaskToBack(true)
            }
        }

    val isCovering: Boolean
        get() = cover.isShown

    fun watch() {
        activity.followRecentsChoice(choices)
        activity.onBackPressedDispatcher.addCallback(activity, keepsBackOut)
        activity.lifecycle.addObserver(this)
    }

    override fun onStart(owner: LifecycleOwner) {
        if (state.returned(choices.isOn, choices.lockAfter)) {
            showCover()
            ask()
        }
    }

    override fun onStop(owner: LifecycleOwner) {
        state.left(isChangingScreens = activity.isChangingConfigurations)
    }

    private fun showCover() {
        cover.show(choices.wordsToShow)
        keepsBackOut.isEnabled = true
    }

    private fun ask() {
        if (!state.startAsking()) return
        activity.askForScreenLock(choices.wordsToShow.prompt) { answer ->
            state.answered(answer)
            when (answer) {
                ScreenLockAnswer.CONFIRMED -> {
                    cover.hide()
                    keepsBackOut.isEnabled = false
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
