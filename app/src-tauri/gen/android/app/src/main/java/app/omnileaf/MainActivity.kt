package app.omnileaf

import android.content.Intent
import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.annotation.ColorInt

class MainActivity : TauriActivity() {
  private val startingTheme: StartingTheme by lazy { RememberedTheme(this).theme() }

  @get:ColorInt
  private val startingBackground: Int by lazy { getColor(startingTheme.pageBackground()) }
  private var webView: WebView? = null
  private var orientation: ScreenOrientation = ScreenOrientation.PortraitOnPhones
  internal val volumeKeys = VolumeKeyCapture()

  /** Tauri's own back handler stays with the first activity, so once Android recreates the activity back would close the app from any page. */
  override val handleBackNavigation = true

  override fun onCreate(savedInstanceState: Bundle?) {
    ChosenIconActions.startNewPage()
    choiceAtLaunch(savedInstanceState)?.let(ChosenIconActions::choose)
    showStartingBarIcons(startingTheme)
    showTheAppBehindTheNavigationButtons()
    turnScreen(resources.configuration)
    showPageBackground(startingBackground)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    intent.chosenIconAction()?.let(ChosenIconActions::choose)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    turnScreen(newConfig)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean =
    volumeKeys.handle(event.toKeyPress()) || super.dispatchKeyEvent(event)

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

  /** Android hands an activity it restores, or reopens from Recents, the intent that first started its task, so only a fresh launch carries a new choice. */
  private fun choiceAtLaunch(savedInstanceState: Bundle?): IconAction? =
    if (savedInstanceState == null && !intent.isFromRecents) intent.chosenIconAction() else null

  private fun showTheAppBehindTheNavigationButtons() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
  }

  private fun turnScreen(configuration: Configuration) {
    requestedOrientation = orientation.requestedOn(configuration)
  }
}

private val Intent.isFromRecents: Boolean
  get() = (flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
