package app.omnileaf

import android.webkit.WebView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback

internal interface WebHistory {
    fun goBack()
}

internal class WebViewHistory(
    private val webView: WebView,
) : WebHistory {
    /** Android's WebView keeps no entry for a `pushState`, so `goBack` there does nothing and the page is asked to step back itself. */
    override fun goBack() {
        webView.evaluateJavascript("history.back()", null)
    }
}

internal sealed interface BackGesture {
    data class Moved(
        val progress: Float,
    ) : BackGesture

    data object Cancelled : BackGesture
}

internal fun interface BackGestures {
    fun report(gesture: BackGesture)
}

internal class BackNavigation(
    private val history: WebHistory,
) : OnBackPressedCallback(false) {
    private var gestures: BackGestures? = null

    /** Android plays its back-to-home preview only while no enabled callback would take the gesture. */
    fun followHistory(canGoBack: Boolean) {
        isEnabled = canGoBack
    }

    fun watch(gestures: BackGestures) {
        this.gestures = gestures
    }

    override fun handleOnBackStarted(backEvent: BackEventCompat) {
        gestures?.report(BackGesture.Moved(backEvent.progress))
    }

    override fun handleOnBackProgressed(backEvent: BackEventCompat) {
        gestures?.report(BackGesture.Moved(backEvent.progress))
    }

    override fun handleOnBackCancelled() {
        gestures?.report(BackGesture.Cancelled)
    }

    override fun handleOnBackPressed() {
        history.goBack()
    }
}
