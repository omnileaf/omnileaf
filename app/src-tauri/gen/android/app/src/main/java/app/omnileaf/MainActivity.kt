package app.omnileaf

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.annotation.ColorInt

private const val TABLET_SMALLEST_WIDTH_DP = 600

class MainActivity : TauriActivity() {
  private val startingTheme: StartingTheme by lazy { RememberedTheme(this).theme() }

  @get:ColorInt
  private val startingBackground: Int by lazy { getColor(startingTheme.pageBackground()) }
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    showStartingBarIcons(startingTheme)
    showTheAppBehindTheNavigationButtons()
    keepPhonesInPortrait(resources.configuration)
    showPageBackground(startingBackground)
    super.onCreate(savedInstanceState)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    keepPhonesInPortrait(newConfig)
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

  private fun showTheAppBehindTheNavigationButtons() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
  }

  private fun keepPhonesInPortrait(configuration: Configuration) {
    val isPhone = configuration.smallestScreenWidthDp < TABLET_SMALLEST_WIDTH_DP
    requestedOrientation =
      if (isPhone) ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT
      else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
  }
}
