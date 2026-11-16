package app.omnileaf

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.annotation.ColorInt
import androidx.core.graphics.drawable.toDrawable

class MainActivity : TauriActivity() {
    private val startingTheme: StartingTheme by lazy { RememberedTheme(this).theme() }

    @get:ColorInt
    private val startingBackground: Int by lazy { getColor(startingTheme.pageBackground()) }
    private var webView: WebView? = null
    private var orientation: ScreenOrientation = ScreenOrientation.PortraitOnPhones
    internal val volumeKeys = VolumeKeyCapture()
    internal val handedDocuments = HandedDocuments()
    private val appLock by lazy {
        AppLockGate(this) { isCovered ->
            backNavigation?.followCover(isCovered)
            if (isCovered) webView?.evaluateJavascript(BLUR_FOCUSED_FIELD, null)
        }
    }

    internal var backNavigation: BackNavigation? = null
        private set

    override val handleBackNavigation = false
    override val handleBackButton = false

    override fun onCreate(savedInstanceState: Bundle?) {
        ChosenIconActions.startNewPage()
        takeLaunchRequests(savedInstanceState)
        showStartingBarIcons(startingTheme)
        showTheAppBehindTheNavigationButtons()
        turnScreen(resources.configuration)
        showPageBackground(startingBackground)
        super.onCreate(savedInstanceState)
        appLock.watch()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.chosenIconAction()?.let(ChosenIconActions::choose)
        intent.handedDocument()?.let(handedDocuments::receive)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        turnScreen(newConfig)
    }

    /** AndroidX's Activity Result API and startActivity still launch every screen through this deprecated override. */
    @Suppress("OVERRIDE_DEPRECATION")
    override fun startActivityForResult(
        intent: Intent,
        requestCode: Int,
        options: Bundle?,
    ) {
        super.startActivityForResult(intent, requestCode, options)
        if (isOwnScreen(intent.action)) appLock.openedOwnScreen()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean =
        (!appLock.isCovering && volumeKeys.handle(event.toKeyPress())) || super.dispatchKeyEvent(event)

    override fun onWebViewCreate(webView: WebView) {
        SystemInsets(webView).attach()
        this.webView = webView
        backNavigation =
            BackNavigation(WebViewHistory(webView), leaveTheApp = { finishAffinity() })
                .also {
                    it.followCover(appLock.isCovering)
                    onBackPressedDispatcher.addCallback(this, it)
                }
        webView.setBackgroundColor(startingBackground)
    }

    fun showPageBackground(
        @ColorInt color: Int,
    ) {
        window.setBackgroundDrawable(color.toDrawable())
        webView?.setBackgroundColor(color)
        colourRecentsCard(color)
    }

    fun orient(orientation: ScreenOrientation) {
        this.orientation = orientation
        turnScreen(resources.configuration)
    }

    /**
     * Android hands an activity it restores, or reopens from Recents, the intent that first started its task,
     * so only a fresh launch carries a new choice.
     */
    private fun takeLaunchRequests(savedInstanceState: Bundle?) {
        if (savedInstanceState != null || intent.isFromRecents) return
        intent.chosenIconAction()?.let(ChosenIconActions::choose)
        intent.handedDocument()?.let(handedDocuments::receive)
    }

    private fun turnScreen(configuration: Configuration) {
        requestedOrientation = orientation.requestedOn(configuration)
    }
}

/** Chromium draws an open select's options in a window of its own, above anything drawn over the page. */
private const val BLUR_FOCUSED_FIELD = "document.activeElement?.blur()"

private val Intent.isFromRecents: Boolean
    get() = (flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
