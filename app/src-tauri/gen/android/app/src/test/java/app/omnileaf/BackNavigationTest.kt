package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private class PageHistory : WebHistory {
    var pagesBehind = 0
    var stepsBack = 0

    override fun canGoBack(): Boolean = pagesBehind > 0

    override fun goBack() {
        stepsBack += 1
    }
}

class BackNavigationTest {
    private val history = PageHistory()

    private val back = BackNavigation(history)

    @Test
    fun `leaves back to Android until the page has somewhere to go back to`() {
        val isTaken = back.isEnabled

        assertFalse(isTaken)
    }

    @Test
    fun `takes back once the page has somewhere to go back to`() {
        history.pagesBehind = 1

        back.followHistory()

        assertTrue(back.isEnabled)
    }

    @Test
    fun `hands back to Android again at the first page`() {
        history.pagesBehind = 1
        back.followHistory()
        history.pagesBehind = 0

        back.followHistory()

        assertFalse(back.isEnabled)
    }

    @Test
    fun `goes back one page in the web view`() {
        history.pagesBehind = 1
        back.followHistory()

        back.handleOnBackPressed()

        assertEquals(1, history.stepsBack)
    }
}
