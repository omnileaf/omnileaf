package app.omnileaf

import android.webkit.WebView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback

internal interface WebHistory {
    fun goBack()

    fun lastStepBack(onAnswered: (Long) -> Unit)
}

/** A page takes a frame or two to step back, so Android waits this long before deciding it did not. */
private const val STEP_BACK_ALLOWANCE_MS = 400L

internal class WebViewHistory(
    private val webView: WebView,
) : WebHistory {
    /** Android's WebView keeps no entry for a `pushState`, so `goBack` there does nothing and the page is asked to step back itself. */
    override fun goBack() {
        webView.evaluateJavascript("history.back()", null)
    }

    override fun lastStepBack(onAnswered: (Long) -> Unit) {
        webView.postDelayed(
            {
                webView.evaluateJavascript("String(window.__omnileafLastStepBack ?? 0)") { answer ->
                    onAnswered(answer.trim('"').toLongOrNull() ?: 0L)
                }
            },
            STEP_BACK_ALLOWANCE_MS,
        )
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
    private val leaveTheApp: () -> Unit = {},
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
        val asked = System.currentTimeMillis()
        history.goBack()
        history.lastStepBack { steppedBackAt ->
            if (steppedBackAt < asked) {
                leaveTheApp()
            }
        }
    }
}
