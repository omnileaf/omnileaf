package app.omnileaf

import androidx.activity.BackEventCompat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private class PageHistory : WebHistory {
    var stepsBack = 0

    override fun goBack() {
        stepsBack += 1
    }
}

private fun swipedTo(progress: Float) = BackEventCompat(0f, 0f, progress, BackEventCompat.EDGE_LEFT)

class BackNavigationTest {
    private val history = PageHistory()
    private val gestures = mutableListOf<BackGesture>()

    private val back = BackNavigation(history)

    private fun watched(): BackNavigation =
        back.apply {
            followHistory(canGoBack = true)
            watch { gestures.add(it) }
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

        assertEquals(listOf(BackGesture.Moved(0f), BackGesture.Moved(0.4f)), gestures)
    }

    @Test
    fun `reports a back gesture taken back`() {
        val watching = watched()
        watching.handleOnBackStarted(swipedTo(0f))

        watching.handleOnBackCancelled()

        assertEquals(listOf(BackGesture.Moved(0f), BackGesture.Cancelled), gestures)
    }

    @Test
    fun `still goes back itself when a watched gesture finishes`() {
        val watching = watched()
        watching.handleOnBackStarted(swipedTo(0f))

        watching.handleOnBackPressed()

        assertEquals(1 to listOf(BackGesture.Moved(0f)), history.stepsBack to gestures)
    }
}
