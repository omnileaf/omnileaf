package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppRouteTest {
    @Test
    fun `takes the path and query of an app page`() {
        val route = appRouteOf("http://tauri.localhost/series/42?tab=books")

        assertEquals("/series/42?tab=books", route)
    }

    @Test
    fun `takes the library at the root of the app`() {
        val route = appRouteOf("http://tauri.localhost/")

        assertEquals("/", route)
    }

    @Test
    fun `takes the root of the app when the address has no path`() {
        val route = appRouteOf("http://tauri.localhost")

        assertEquals("/", route)
    }

    @Test
    fun `keeps the path encoded as the page has it`() {
        val route = appRouteOf("http://tauri.localhost/creator/Ana%20Lima?sort=new%20first")

        assertEquals("/creator/Ana%20Lima?sort=new%20first", route)
    }

    @Test
    fun `leaves out the fragment`() {
        val route = appRouteOf("http://tauri.localhost/settings/about#licences")

        assertEquals("/settings/about", route)
    }

    @Test
    fun `refuses a page of another origin`() {
        val pages =
            listOf(
                "https://tauri.localhost/settings",
                "http://example.com/settings",
                "http://tauri.localhost.example.com/settings",
                "http://tauri.localhost:8080/settings",
                "tauri://localhost/settings",
                "about:blank",
            )

        val routes = pages.map(::appRouteOf)

        assertEquals(pages.map { null }, routes)
    }

    @Test
    fun `refuses a path that would lead out of the app`() {
        val route = appRouteOf("http://tauri.localhost//example.com/settings")

        assertNull(route)
    }

    @Test
    fun `refuses an address that does not parse`() {
        val route = appRouteOf("http://tauri.localhost/a b")

        assertNull(route)
    }
}
