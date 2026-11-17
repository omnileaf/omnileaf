package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val SERIES_PAGE = "/series/42"
private const val SETTINGS_PAGE_URL = "http://tauri.localhost/settings/appearance"
private const val ROOT_PAGE_URL = "http://tauri.localhost/"

private fun savedRoute(route: String?): RouteToRestore = RouteToRestore().apply { load(route) }

class RouteToRestoreTest {
    @Test
    fun `hands the saved route over again to a page reloaded before it shows the route`() {
        val saved = savedRoute(SERIES_PAGE)
        saved.take()

        val taken = saved.take()

        assertEquals(SERIES_PAGE, taken)
    }

    @Test
    fun `hands nothing over once the opening page shows`() {
        val saved = savedRoute(SERIES_PAGE)
        saved.take()
        saved.openingPageShown()

        val taken = saved.take()

        assertNull(taken)
    }

    @Test
    fun `hands nothing over on a fresh start`() {
        val saved = savedRoute(null)

        val taken = saved.take()

        assertNull(taken)
    }

    @Test
    fun `gives way to a launch request`() {
        val saved = savedRoute(SERIES_PAGE)

        saved.drop()

        assertNull(saved.take())
    }

    @Test
    fun `saves the page the app shows once it shows the route taken`() {
        val saved = savedRoute(SERIES_PAGE)
        saved.take()
        saved.openingPageShown()

        val route = saved.routeToSave(SETTINGS_PAGE_URL)

        assertEquals("/settings/appearance", route)
    }

    @Test
    fun `saves again a route taken while the page is still at the root`() {
        val saved = savedRoute(SERIES_PAGE)
        saved.take()

        val route = saved.routeToSave(ROOT_PAGE_URL)

        assertEquals(SERIES_PAGE, route)
    }

    @Test
    fun `saves the page the app shows once a launch request replaces the route taken`() {
        val saved = savedRoute(SERIES_PAGE)
        saved.take()
        saved.drop()

        val route = saved.routeToSave(SETTINGS_PAGE_URL)

        assertEquals("/settings/appearance", route)
    }

    @Test
    fun `saves again a route the page has not taken yet`() {
        val saved = savedRoute(SERIES_PAGE)

        val route = saved.routeToSave(ROOT_PAGE_URL)

        assertEquals(SERIES_PAGE, route)
    }

    @Test
    fun `saves nothing for a page outside the app`() {
        val saved = savedRoute(null)

        val route = saved.routeToSave("http://example.com/settings")

        assertNull(route)
    }

    @Test
    fun `saves nothing before the web view has a page`() {
        val saved = savedRoute(null)

        val route = saved.routeToSave(null)

        assertNull(route)
    }
}
