package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val SAVED_ROUTE = "/settings/appearance"
private const val DOCUMENT = "content://documents.test/document/42"
private const val ROOT_PAGE_URL = "http://tauri.localhost/"
private const val HISTORY_PAGE_URL = "http://tauri.localhost/history"
private const val OUTSIDE_PAGE_URL = "http://example.com/settings"
private val PLAIN_LAUNCH = LaunchIntent(iconAction = null, handedDocument = null, isFromRecents = false)
private val SEARCH_REQUEST = PLAIN_LAUNCH.copy(iconAction = IconAction.SEARCH_LIBRARY)
private val DOCUMENT_REQUEST = PLAIN_LAUNCH.copy(handedDocument = DOCUMENT)
private val REBUILT_SCREEN = SavedScreen(SAVED_ROUTE)

private sealed interface IconPageEvent {
    data object NewPage : IconPageEvent

    data class Chose(
        val action: IconAction,
    ) : IconPageEvent
}

private class RecordedIconActions : IconActionChoices {
    val events = mutableListOf<IconPageEvent>()
    val chosen: List<IconAction>
        get() = events.filterIsInstance<IconPageEvent.Chose>().map { it.action }

    override fun startNewPage() {
        events += IconPageEvent.NewPage
    }

    override fun choose(chosen: IconAction) {
        events += IconPageEvent.Chose(chosen)
    }
}

class LaunchRequestsTest {
    private val iconActions = RecordedIconActions()
    private val requests = LaunchRequests(iconActions)

    private fun handedOver(): List<String> = mutableListOf<String>().also { handed -> requests.watchHandedDocuments { handed += it } }

    @Test
    fun `takes the request a fresh launch carries`() {
        requests.takeCreating(SEARCH_REQUEST, saved = null)

        assertEquals(listOf(IconAction.SEARCH_LIBRARY), iconActions.chosen)
    }

    @Test
    fun `starts a new page before taking the request a fresh launch carries`() {
        requests.takeCreating(SEARCH_REQUEST, saved = null)

        assertEquals(listOf(IconPageEvent.NewPage, IconPageEvent.Chose(IconAction.SEARCH_LIBRARY)), iconActions.events)
    }

    @Test
    fun `starts a new page for a rebuilt screen`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)

        assertEquals(listOf(IconPageEvent.NewPage), iconActions.events)
    }

    @Test
    fun `hands over the document a fresh launch carries`() {
        requests.takeCreating(DOCUMENT_REQUEST, saved = null)

        assertEquals(listOf(DOCUMENT), handedOver())
    }

    @Test
    fun `keeps the route a rebuilt screen saved`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)

        val route = requests.savedRoute()

        assertEquals(SAVED_ROUTE, route)
    }

    @Test
    fun `hands the saved route over again to a page reloaded before it shows the route`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)
        requests.savedRoute()

        val route = requests.savedRoute()

        assertEquals(SAVED_ROUTE, route)
    }

    @Test
    fun `hands nothing over once the opening page shows`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)
        requests.savedRoute()
        requests.openingPageShown()

        val route = requests.savedRoute()

        assertNull(route)
    }

    @Test
    fun `hands nothing over on a fresh start`() {
        requests.takeCreating(PLAIN_LAUNCH, saved = null)

        val route = requests.savedRoute()

        assertNull(route)
    }

    @Test
    fun `saves again a route the page has not asked for yet`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)

        val route = requests.routeToSave(ROOT_PAGE_URL)

        assertEquals(SAVED_ROUTE, route)
    }

    @Test
    fun `saves the route handed over again when the screen is rebuilt before the page shows it`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)
        requests.savedRoute()

        val route = requests.routeToSave(ROOT_PAGE_URL)

        assertEquals(SAVED_ROUTE, route)
    }

    @Test
    fun `saves the page shown once the opening page shows`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)
        requests.savedRoute()
        requests.openingPageShown()

        val route = requests.routeToSave(ROOT_PAGE_URL)

        assertEquals("/", route)
    }

    @Test
    fun `saves the page shown once a later request drops the saved route`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)
        requests.savedRoute()
        requests.take(SEARCH_REQUEST)

        val route = requests.routeToSave(HISTORY_PAGE_URL)

        assertEquals("/history", route)
    }

    @Test
    fun `saves nothing for a page outside the app`() {
        requests.takeCreating(PLAIN_LAUNCH, saved = null)

        val route = requests.routeToSave(OUTSIDE_PAGE_URL)

        assertNull(route)
    }

    @Test
    fun `saves nothing before the web view has a page`() {
        requests.takeCreating(PLAIN_LAUNCH, saved = null)

        val route = requests.routeToSave(null)

        assertNull(route)
    }

    @Test
    fun `ignores the request of the intent that created a rebuilt screen`() {
        requests.takeCreating(SEARCH_REQUEST, REBUILT_SCREEN)

        assertEquals(emptyList<IconAction>(), iconActions.chosen)
    }

    @Test
    fun `keeps the saved route despite the intent that created a rebuilt screen`() {
        requests.takeCreating(SEARCH_REQUEST, REBUILT_SCREEN)

        val route = requests.savedRoute()

        assertEquals(SAVED_ROUTE, route)
    }

    @Test
    fun `ignores the intent Recents hands back to a fresh screen`() {
        requests.takeCreating(SEARCH_REQUEST.copy(isFromRecents = true), saved = null)

        assertEquals(emptyList<IconAction>(), iconActions.chosen)
    }

    @Test
    fun `takes a shortcut chosen after a rebuild`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)

        requests.take(SEARCH_REQUEST)

        assertEquals(listOf(IconAction.SEARCH_LIBRARY), iconActions.chosen)
    }

    @Test
    fun `drops the saved route for a shortcut chosen later`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)
        requests.take(SEARCH_REQUEST)

        val route = requests.savedRoute()

        assertNull(route)
    }

    @Test
    fun `drops the saved route for a document handed over later`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)
        requests.take(DOCUMENT_REQUEST)

        val route = requests.savedRoute()

        assertNull(route)
    }

    @Test
    fun `keeps the saved route for a later intent with no request`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)
        requests.take(PLAIN_LAUNCH)

        val route = requests.savedRoute()

        assertEquals(SAVED_ROUTE, route)
    }
}
