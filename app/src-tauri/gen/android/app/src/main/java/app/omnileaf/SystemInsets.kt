package app.omnileaf

import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
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
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val keyboard = insets.getInsets(KEYBOARD)
            makeRoomFor(keyboard)
            val uncovered = insets.getInsets(SYSTEM_AREAS).aboveKeyboard(keyboard)
            publish(insetVariablesScript(uncovered, view.resources.displayMetrics.density))
            ViewCompat.onApplyWindowInsets(view, insets.withoutKeyboard())
        }
        ViewCompat.requestApplyInsets(webView)
    }

    /** Android 15 draws edge-to-edge apps under the keyboard rather than resizing them, so the page would slide under the status bar. */
    private fun makeRoomFor(keyboard: Insets) {
        webView.updateLayoutParams<ViewGroup.MarginLayoutParams> { bottomMargin = keyboard.bottom }
    }

    private fun publish(script: String) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            documentStartScript?.remove()
            documentStartScript = WebViewCompat.addDocumentStartJavaScript(webView, script, EVERY_ORIGIN)
        }
        webView.evaluateJavascript(script, null)
    }
}

internal fun Insets.aboveKeyboard(keyboard: Insets): Insets = Insets.of(left, top, right, maxOf(0, bottom - keyboard.bottom))

private fun WindowInsetsCompat.withoutKeyboard(): WindowInsetsCompat =
    WindowInsetsCompat.Builder(this).setInsets(KEYBOARD, Insets.NONE).build()

internal fun insetVariablesScript(
    areas: Insets,
    density: Float,
): String =
    listOf("top" to areas.top, "right" to areas.right, "bottom" to areas.bottom, "left" to areas.left)
        .joinToString(separator = "") { (side, px) ->
            "document.documentElement.style.setProperty('--system-inset-$side','${px / density}px');"
        }
