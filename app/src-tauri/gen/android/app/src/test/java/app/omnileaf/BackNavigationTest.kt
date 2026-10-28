package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackNavigationTest {
    private var stepsBack = 0

    private val back = BackNavigation { stepsBack += 1 }

    @Test
    fun `leaves back to Android until the page has somewhere to go back to`() {
        val isTaken = back.isEnabled

        assertFalse(isTaken)
    }

    @Test
    fun `takes back once the page has somewhere to go back to`() {
        back.follow(canGoBack = true)

        assertTrue(back.isEnabled)
    }

    @Test
    fun `hands back to Android again at the first page`() {
        back.follow(canGoBack = true)

        back.follow(canGoBack = false)

        assertFalse(back.isEnabled)
    }

    @Test
    fun `goes back one page in the web view`() {
        back.follow(canGoBack = true)

        back.handleOnBackPressed()

        assertEquals(1, stepsBack)
    }
}
