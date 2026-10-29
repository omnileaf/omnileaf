package app.omnileaf

import android.webkit.WebView
import androidx.activity.OnBackPressedCallback

internal interface WebHistory {
    fun canGoBack(): Boolean

    fun goBack()
}

internal class WebViewHistory(
    private val webView: WebView,
) : WebHistory {
    override fun canGoBack(): Boolean = webView.canGoBack()

    override fun goBack() = webView.goBack()
}

internal class BackNavigation(
    private val history: WebHistory,
) : OnBackPressedCallback(false) {
    /** Android plays its back-to-home preview only while no enabled callback would take the gesture. */
    fun followHistory() {
        isEnabled = history.canGoBack()
    }

    override fun handleOnBackPressed() {
        history.goBack()
    }
}
