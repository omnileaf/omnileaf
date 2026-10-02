package app.omnileaf

import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

private val SYSTEM_AREAS =
  WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
private val EVERY_ORIGIN = setOf("*")

/** Gives the page the system bar and cutout sizes as CSS variables, since older WebViews report no safe area for the system bars. */
class SystemInsets(private val webView: WebView) {
  private var documentStartScript: ScriptHandler? = null

  fun attach() {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val areas = insets.getInsets(SYSTEM_AREAS)
      publish(insetVariablesScript(areas.top, areas.bottom, view.resources.displayMetrics.density))
      ViewCompat.onApplyWindowInsets(view, insets)
    }
    ViewCompat.requestApplyInsets(webView)
  }

  private fun publish(script: String) {
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      documentStartScript?.remove()
      documentStartScript = WebViewCompat.addDocumentStartJavaScript(webView, script, EVERY_ORIGIN)
    }
    webView.evaluateJavascript(script, null)
  }
}

internal fun insetVariablesScript(topPx: Int, bottomPx: Int, density: Float): String =
  mapOf("top" to topPx, "bottom" to bottomPx).entries.joinToString(separator = "") { (side, px) ->
    "document.documentElement.style.setProperty('--system-inset-$side','${px / density}px');"
  }
