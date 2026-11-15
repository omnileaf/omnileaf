package app.omnileaf

import androidx.activity.OnBackPressedCallback
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

internal class AppLockGate(
    private val activity: FragmentActivity,
    private val onCovered: (Boolean) -> Unit,
) : DefaultLifecycleObserver {
    private val choices = AppLockChoices(activity.applicationContext)
    private val state = AppLocks.state
    private val cover = LockCover(activity, onUnlock = ::ask)
    private var keepsBackOut: OnBackPressedCallback? = null
    private val prompt = LockPrompt()

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
        state.left(prompt.isStillInTheApp(activity.isChangingConfigurations))
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
        onCovered(true)
    }

    private fun hideCover() {
        cover.hide()
        keepsBackOut?.remove()
        keepsBackOut = null
        onCovered(false)
    }

    private fun ask() {
        if (!state.isCovered || !prompt.open()) return
        activity.askForScreenLock(choices.wordsToShow.prompt) { answer ->
            prompt.close()
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
