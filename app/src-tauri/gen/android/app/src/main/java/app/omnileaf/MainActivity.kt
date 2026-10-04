package app.omnileaf

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

private const val TABLET_SMALLEST_WIDTH_DP = 600

class MainActivity : TauriActivity() {
  private val rememberedBackground: Int? by lazy { RememberedBackground(this).color() }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    showTheAppBehindTheNavigationButtons()
    keepPhonesInPortrait(resources.configuration)
    rememberedBackground?.let { showPageBackground(it) }
    super.onCreate(savedInstanceState)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    keepPhonesInPortrait(newConfig)
  }

  override fun onWebViewCreate(webView: WebView) {
    SystemInsets(webView).attach()
    rememberedBackground?.let(webView::setBackgroundColor)
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
