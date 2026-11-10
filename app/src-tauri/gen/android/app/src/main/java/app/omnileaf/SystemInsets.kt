package app.omnileaf

import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.marginBottom
import androidx.core.view.updateLayoutParams
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

private val SYSTEM_AREAS =
    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
private val KEYBOARD = WindowInsetsCompat.Type.ime()
private val EVERY_ORIGIN = setOf("*")

/** Gives the page the system bar and cutout sizes as CSS variables, since older WebViews report no safe area for the system bars. */
class SystemInsets(
    private val webView: WebView,
) {
    private var documentStartScript: ScriptHandler? = null

    fun attach() {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val keyboard = insets.getInsets(KEYBOARD)
            makeRoomFor(keyboard)
            val aboveKeyboard = insets.inset(0, 0, 0, keyboard.bottom)
            val density = webView.resources.displayMetrics.density
            publish(insetVariablesScript(aboveKeyboard.getInsets(SYSTEM_AREAS), density) + keyboardShownScript(keyboard.bottom > 0))
            ViewCompat.onApplyWindowInsets(webView, aboveKeyboard)
        }
        ViewCompat.requestApplyInsets(webView)
    }

    /** An edge-to-edge window is not resized for the keyboard, so the WebView is shortened to end above it. */
    private fun makeRoomFor(keyboard: Insets) {
        if (webView.marginBottom != keyboard.bottom) {
            webView.updateLayoutParams<ViewGroup.MarginLayoutParams> { bottomMargin = keyboard.bottom }
        }
    }

    private fun publish(script: String) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            documentStartScript?.remove()
            documentStartScript = WebViewCompat.addDocumentStartJavaScript(webView, script, EVERY_ORIGIN)
        }
        webView.evaluateJavascript(script, null)
    }
}

internal fun insetVariablesScript(
    areas: Insets,
    density: Float,
): String =
    listOf("top" to areas.top, "right" to areas.right, "bottom" to areas.bottom, "left" to areas.left)
        .joinToString(separator = "") { (side, px) ->
            "document.documentElement.style.setProperty('--system-inset-$side','${px / density}px');"
        }

internal fun keyboardShownScript(isShown: Boolean): String = "document.documentElement.toggleAttribute('data-keyboard-shown',$isShown);"
