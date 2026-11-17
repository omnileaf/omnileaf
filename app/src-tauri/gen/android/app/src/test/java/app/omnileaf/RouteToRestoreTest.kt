package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val SERIES_PAGE = "/series/42"
private const val SETTINGS_PAGE_URL = "http://tauri.localhost/settings/appearance"

class RouteToRestoreTest {
    @Test
    fun `hands the saved route over once`() {
        val saved = RouteToRestore(SERIES_PAGE)

        val taken = listOf(saved.take(), saved.take())

        assertEquals(listOf(SERIES_PAGE, null), taken)
    }

    @Test
    fun `hands nothing over on a fresh start`() {
        val saved = RouteToRestore(null)

        assertNull(saved.take())
    }

    @Test
    fun `gives way to a launch request`() {
        val saved = RouteToRestore(SERIES_PAGE)

        saved.drop()

        assertNull(saved.take())
    }

    @Test
    fun `saves the page the app shows once the route is taken`() {
        val saved = RouteToRestore(SERIES_PAGE)
        saved.take()

        assertEquals("/settings/appearance", saved.toSave(SETTINGS_PAGE_URL))
    }

    @Test
    fun `saves again a route the page has not taken yet`() {
        val saved = RouteToRestore(SERIES_PAGE)

        assertEquals(SERIES_PAGE, saved.toSave("http://tauri.localhost/"))
    }

    @Test
    fun `saves nothing for a page outside the app`() {
        val saved = RouteToRestore(null)

        assertNull(saved.toSave("http://example.com/settings"))
    }

    @Test
    fun `saves nothing before the web view has a page`() {
        val saved = RouteToRestore(null)

        assertNull(saved.toSave(null))
    }
}
