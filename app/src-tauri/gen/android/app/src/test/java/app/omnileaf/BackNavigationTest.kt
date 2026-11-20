package app.omnileaf

import androidx.activity.BackEventCompat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private class PageHistory : WebHistory {
    var stepsBack = 0
    var steppedBackAt = 0L

    override fun goBack() {
        stepsBack += 1
    }

    override fun lastStepBack(onAnswered: (Long) -> Unit) {
        onAnswered(steppedBackAt)
    }
}

private const val SCREEN_HEIGHT_PX = 2000f

private fun swipedTo(
    progress: Float,
    touchYPx: Float = 500f,
    edge: Int = BackEventCompat.EDGE_LEFT,
) = BackEventCompat(0f, touchYPx, progress, edge)

private const val SCREEN_CORNER_DP = 32f

private fun movedTo(
    progress: Float,
    touchY: Float = 0.25f,
    edge: SwipeSide = SwipeSide.LEFT,
) = BackGesture.Moved(progress, edge, touchY, SCREEN_CORNER_DP)

class BackNavigationTest {
    private val history = PageHistory()
    private val gestures = mutableListOf<BackGesture>()

    private var leftTheApp = 0

    private val back =
        BackNavigation(history, ScreenShape(heightPx = { SCREEN_HEIGHT_PX }, cornerDp = { SCREEN_CORNER_DP })) {
            leftTheApp += 1
        }

    private fun watched(): BackNavigation =
        back.apply {
            followHistory(canGoBack = true)
            watch { gestures.add(it) }
        }

    @Test
    fun `stands down while the app lock covers the page`() {
        back.followHistory(canGoBack = true)

        back.followCover(isCovered = true)
        val whileCovered = back.isEnabled
        back.followHistory(canGoBack = true)
        val afterHistoryMoves = back.isEnabled
        back.followCover(isCovered = false)

        assertFalse(whileCovered)
        assertFalse(afterHistoryMoves)
        assertTrue(back.isEnabled)
    }

    @Test
    fun `leaves back to Android until the page has somewhere to go back to`() {
        val isTaken = back.isEnabled

        assertFalse(isTaken)
    }

    @Test
    fun `takes back once the page has somewhere to go back to`() {
        back.followHistory(canGoBack = true)

        assertTrue(back.isEnabled)
    }

    @Test
    fun `hands back to Android again at the first page`() {
        back.followHistory(canGoBack = true)

        back.followHistory(canGoBack = false)

        assertFalse(back.isEnabled)
    }

    @Test
    fun `goes back one page in the web view`() {
        back.followHistory(canGoBack = true)

        back.handleOnBackPressed()

        assertEquals(1, history.stepsBack)
    }

    @Test
    fun `reports how far the back gesture has moved`() {
        val watching = watched()

        watching.handleOnBackStarted(swipedTo(0f))
        watching.handleOnBackProgressed(swipedTo(0.4f))

        assertEquals(listOf(movedTo(0f), movedTo(0.4f)), gestures)
    }

    @Test
    fun `reports the edge a gesture started from and where the finger is down the screen`() {
        val watching = watched()

        watching.handleOnBackStarted(swipedTo(0f, touchYPx = 1500f, edge = BackEventCompat.EDGE_RIGHT))

        assertEquals(listOf(movedTo(0f, touchY = 0.75f, edge = SwipeSide.RIGHT)), gestures)
    }

    @Test
    fun `reports a back gesture taken back`() {
        val watching = watched()
        watching.handleOnBackStarted(swipedTo(0f))

        watching.handleOnBackCancelled()

        assertEquals(listOf(movedTo(0f), BackGesture.Cancelled), gestures)
    }

    @Test
    fun `still goes back itself when a watched gesture finishes`() {
        val watching = watched()
        watching.handleOnBackStarted(swipedTo(0f))

        watching.handleOnBackPressed()

        assertEquals(1 to listOf(movedTo(0f)), history.stepsBack to gestures)
    }

    @Test
    fun `leaves the app when the page had nowhere to go back to`() {
        back.followHistory(canGoBack = true)

        back.handleOnBackPressed()

        assertEquals(1, leftTheApp)
    }

    @Test
    fun `stays in the app when the page stepped back`() {
        back.followHistory(canGoBack = true)
        history.steppedBackAt = System.currentTimeMillis() + 1_000

        back.handleOnBackPressed()

        assertEquals(0, leftTheApp)
    }
}
