package app.omnileaf

import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.annotation.ColorInt

class MainActivity : TauriActivity() {
  private val startingTheme: StartingTheme by lazy { RememberedTheme(this).theme() }

  @get:ColorInt
  private val startingBackground: Int by lazy { getColor(startingTheme.pageBackground()) }
  private var webView: WebView? = null
  private var orientation: ScreenOrientation = ScreenOrientation.PortraitOnPhones

  /** Tauri's own back handler stays with the first activity, so once Android recreates the activity back would close the app from any page. */
  override val handleBackNavigation = true

  override fun onCreate(savedInstanceState: Bundle?) {
    showStartingBarIcons(startingTheme)
    showTheAppBehindTheNavigationButtons()
    turnScreen(resources.configuration)
    showPageBackground(startingBackground)
    super.onCreate(savedInstanceState)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    turnScreen(newConfig)
  }

  override fun onWebViewCreate(webView: WebView) {
    SystemInsets(webView).attach()
    this.webView = webView
    webView.setBackgroundColor(startingBackground)
  }

  fun showPageBackground(@ColorInt color: Int) {
    window.setBackgroundDrawable(ColorDrawable(color))
    webView?.setBackgroundColor(color)
  }

  fun orient(orientation: ScreenOrientation) {
    this.orientation = orientation
    turnScreen(resources.configuration)
  }

  private fun showTheAppBehindTheNavigationButtons() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
  }

  private fun turnScreen(configuration: Configuration) {
    requestedOrientation = orientation.requestedOn(configuration)
  }
}
