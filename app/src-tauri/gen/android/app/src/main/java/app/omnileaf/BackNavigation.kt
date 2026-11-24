package app.omnileaf

import android.view.RoundedCorner
import android.view.View
import android.webkit.WebView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback

internal interface WebHistory {
    fun goBack()

    fun lastStepBack(onAnswered: (Long) -> Unit)
}

/** A page takes a frame or two to step back, so Android waits this long before deciding it did not. */
private const val STEP_BACK_ALLOWANCE_MS = 400L

private const val SCREEN_MIDDLE = 0.5f

internal class WebViewHistory(
    private val webView: WebView,
) : WebHistory {
    /** Android's WebView keeps no entry for a `pushState`, so `goBack` there does nothing and the page is asked to step back itself. */
    override fun goBack() {
        webView.evaluateJavascript("history.back()", null)
    }

    override fun lastStepBack(onAnswered: (Long) -> Unit) {
        webView.postDelayed(
            {
                webView.evaluateJavascript("String(window.__omnileafLastStepBack ?? 0)") { answer ->
                    onAnswered(answer.trim('"').toLongOrNull() ?: 0L)
                }
            },
            STEP_BACK_ALLOWANCE_MS,
        )
    }
}

internal enum class SwipeSide(
    val id: String,
) {
    LEFT("left"),
    RIGHT("right"),
}

internal data class BackPosition(
    val progress: Float,
    val edge: SwipeSide,
    val touchY: Float,
    val cornerDp: Float,
)

internal sealed interface BackGesture {
    data class Started(
        val at: BackPosition,
    ) : BackGesture

    data class Moved(
        val at: BackPosition,
    ) : BackGesture

    data object Cancelled : BackGesture
}

internal fun interface BackGestures {
    fun report(gesture: BackGesture)
}

internal fun View.screenCornerDp(): Float {
    val corner = rootWindowInsets?.getRoundedCorner(RoundedCorner.POSITION_TOP_LEFT) ?: return 0f
    return corner.radius / resources.displayMetrics.density
}

internal class ScreenShape(
    val heightPx: () -> Float,
    val cornerDp: () -> Float,
)

internal class BackNavigation(
    private val history: WebHistory,
    private val screen: ScreenShape,
    private val leaveTheApp: () -> Unit = {},
) : OnBackPressedCallback(false) {
    private var gestures: BackGestures? = null
    private var canGoBack = false
    private var isCovered = false

    /** Android plays its back-to-home preview only while no enabled callback would take the gesture. */
    fun followHistory(canGoBack: Boolean) {
        this.canGoBack = canGoBack
        takeBackWhenItCan()
    }

    fun followCover(isCovered: Boolean) {
        this.isCovered = isCovered
        takeBackWhenItCan()
    }

    private fun takeBackWhenItCan() {
        isEnabled = canGoBack && !isCovered
    }

    fun watch(gestures: BackGestures) {
        this.gestures = gestures
    }

    override fun handleOnBackStarted(backEvent: BackEventCompat) {
        gestures?.report(BackGesture.Started(positionOf(backEvent)))
    }

    override fun handleOnBackProgressed(backEvent: BackEventCompat) {
        gestures?.report(BackGesture.Moved(positionOf(backEvent)))
    }

    private fun positionOf(backEvent: BackEventCompat): BackPosition =
        BackPosition(
            progress = backEvent.progress,
            edge = if (backEvent.swipeEdge == BackEventCompat.EDGE_RIGHT) SwipeSide.RIGHT else SwipeSide.LEFT,
            touchY = screen.heightPx().takeIf { it > 0f }?.let { backEvent.touchY / it } ?: SCREEN_MIDDLE,
            cornerDp = screen.cornerDp(),
        )

    override fun handleOnBackCancelled() {
        gestures?.report(BackGesture.Cancelled)
    }

    override fun handleOnBackPressed() {
        val asked = System.currentTimeMillis()
        history.goBack()
        history.lastStepBack { steppedBackAt ->
            if (steppedBackAt < asked) {
                leaveTheApp()
            }
        }
    }
}
