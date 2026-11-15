package app.omnileaf

import android.content.SharedPreferences
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

internal class AppLockGate(
    private val activity: FragmentActivity,
    private val state: LockState = AppLocks.state,
    private val onCovered: (Boolean) -> Unit,
) : DefaultLifecycleObserver {
    private val choices = AppLockChoices(activity.applicationContext)
    private val cover = LockCover(activity, onUnlock = ::ask)
    private val prompt = LockPrompt()
    private var keepsBackOut: OnBackPressedCallback? = null
    private var recentsListener: SharedPreferences.OnSharedPreferenceChangeListener? = null

    val isCovering: Boolean
        get() = cover.isShown

    fun watch() {
        activity.followRecentsChoice(choices)
        recentsListener = choices.onRecentsChoiceChanged { activity.followRecentsChoice(choices) }
        activity.lifecycle.addObserver(this)
    }

    fun openedOwnScreen() {
        state.openedOwnScreen()
    }

    override fun onStart(owner: LifecycleOwner) {
        if (state.returned(choices.isOn, choices.lockAfter)) {
            showCover()
            ask()
        } else {
            hideCover()
        }
    }

    override fun onResume(owner: LifecycleOwner) {
        state.resumed()
    }

    override fun onStop(owner: LifecycleOwner) {
        state.left(prompt.isStillInTheApp(activity.isChangingConfigurations))
    }

    override fun onDestroy(owner: LifecycleOwner) {
        recentsListener?.let(choices::stopFollowing)
        recentsListener = null
    }

    private fun showCover() {
        if (cover.isShown) return
        cover.show(choices.wordsToShow())
        keepsBackOut =
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    activity.moveTaskToBack(true)
                }
            }.also { activity.onBackPressedDispatcher.addCallback(activity, it) }
        onCovered(true)
    }

    private fun hideCover() {
        if (!cover.isShown) return
        cover.hide()
        keepsBackOut?.remove()
        keepsBackOut = null
        onCovered(false)
    }

    private fun ask() {
        if (!state.isCovered || !prompt.open()) return
        val words = choices.wordsToShow()
        activity.askForScreenLock(words.prompt) { answer ->
            prompt.close()
            when (state.answered(answer)) {
                LockOutcome.STAY_COVERED -> {
                    Unit
                }

                LockOutcome.UNCOVER -> {
                    hideCover()
                }

                LockOutcome.TURN_OFF -> {
                    choices.turn(isOn = false)
                    hideCover()
                    Toast.makeText(activity, words.turnedOff, Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
