package app.omnileaf

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

private const val TABLET_SMALLEST_WIDTH_DP = 600

class MainActivity : TauriActivity() {
  /** Tauri's own back handler stays with the first activity, so once Android recreates the activity back would close the app from any page. */
  override val handleBackNavigation = true

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    showTheAppBehindTheNavigationButtons()
    keepPhonesInPortrait(resources.configuration)
    super.onCreate(savedInstanceState)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    keepPhonesInPortrait(newConfig)
  }

  override fun onWebViewCreate(webView: WebView) {
    SystemInsets(webView).attach()
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
