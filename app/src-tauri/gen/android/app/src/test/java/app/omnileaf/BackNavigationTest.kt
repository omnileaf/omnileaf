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

/** Android gives a back from a button rather than a swipe the edge `BackEvent.EDGE_NONE`, which `BackEventCompat` 1.10 has no name for. */
private const val BUTTON_BACK_EDGE = 2

private fun swipedTo(
    progress: Float,
    touchYPx: Float = 500f,
    edge: Int = BackEventCompat.EDGE_LEFT,
) = BackEventCompat(0f, touchYPx, progress, edge)

private const val SCREEN_CORNER_DP = 32f

private fun positionAt(
    progress: Float,
    touchY: Float = 0.25f,
    edge: SwipeSide = SwipeSide.LEFT,
) = BackPosition(progress, edge, touchY, SCREEN_CORNER_DP)

private fun startedAt(
    progress: Float,
    touchY: Float = 0.25f,
    edge: SwipeSide = SwipeSide.LEFT,
) = BackGesture.Started(positionAt(progress, touchY, edge))

private fun movedTo(progress: Float) = BackGesture.Moved(positionAt(progress))

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
    fun `reports where the back gesture started and how far it has moved`() {
        val watching = watched()

        watching.handleOnBackStarted(swipedTo(0f))
        watching.handleOnBackProgressed(swipedTo(0.4f))

        assertEquals(listOf(startedAt(0f), movedTo(0.4f)), gestures)
    }

    @Test
    fun `reports the edge a gesture started from and where the finger is down the screen`() {
        val watching = watched()

        watching.handleOnBackStarted(swipedTo(0f, touchYPx = 1500f, edge = BackEventCompat.EDGE_RIGHT))

        assertEquals(listOf(startedAt(0f, touchY = 0.75f, edge = SwipeSide.RIGHT)), gestures)
    }

    @Test
    fun `reports a back gesture taken back`() {
        val watching = watched()
        watching.handleOnBackStarted(swipedTo(0f))

        watching.handleOnBackCancelled()

        assertEquals(listOf(startedAt(0f), BackGesture.Cancelled), gestures)
    }

    @Test
    fun `still goes back itself when a watched gesture finishes`() {
        val watching = watched()
        watching.handleOnBackStarted(swipedTo(0f))

        watching.handleOnBackPressed()

        assertEquals(1 to listOf(startedAt(0f)), history.stepsBack to gestures)
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

    @Test
    fun `takes the largest of the screen's corners, as Material's full-screen back does`() {
        val cornerDp = largestCornerDp(listOf(60, 90, 120, 90), density = 2f)

        assertEquals(60f, cornerDp)
    }

    @Test
    fun `takes a screen without rounded corners as square`() {
        val cornerDp = largestCornerDp(emptyList(), density = 2f)

        assertEquals(0f, cornerDp)
    }

    @Test
    fun `takes a button's back, which has no finger, as halfway down the screen`() {
        val watching = watched()

        watching.handleOnBackStarted(BackEventCompat(Float.NaN, Float.NaN, 0f, BUTTON_BACK_EDGE))

        assertEquals(listOf(startedAt(0f, touchY = 0.5f)), gestures)
    }
}
