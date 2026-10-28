package app.omnileaf

import androidx.activity.OnBackPressedCallback

internal fun interface WebHistory {
    fun goBack()
}

internal class BackNavigation(
    private val history: WebHistory,
) : OnBackPressedCallback(false) {
    /** Android plays its back-to-home preview only while no enabled callback would take the gesture. */
    fun follow(canGoBack: Boolean) {
        isEnabled = canGoBack
    }

    override fun handleOnBackPressed() {
        history.goBack()
    }
}
