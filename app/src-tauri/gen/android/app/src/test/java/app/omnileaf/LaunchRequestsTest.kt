package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val SAVED_ROUTE = "/settings/appearance"
private const val DOCUMENT = "content://documents.test/document/42"
private val PLAIN_LAUNCH = LaunchIntent(iconAction = null, handedDocument = null, isFromRecents = false)
private val SEARCH_REQUEST = PLAIN_LAUNCH.copy(iconAction = IconAction.SEARCH_LIBRARY)
private val DOCUMENT_REQUEST = PLAIN_LAUNCH.copy(handedDocument = DOCUMENT)
private val REBUILT_SCREEN = SavedScreen(SAVED_ROUTE)

class LaunchRequestsTest {
    private val chosen = mutableListOf<IconAction>()
    private val requests = LaunchRequests { action -> chosen += action }

    private fun handedOver(): List<String> = mutableListOf<String>().also { handed -> requests.watchHandedDocuments { handed += it } }

    @Test
    fun `takes the request a fresh launch carries`() {
        requests.takeCreating(SEARCH_REQUEST, saved = null)

        assertEquals(listOf(IconAction.SEARCH_LIBRARY), chosen)
    }

    @Test
    fun `hands over the document a fresh launch carries`() {
        requests.takeCreating(DOCUMENT_REQUEST, saved = null)

        assertEquals(listOf(DOCUMENT), handedOver())
    }

    @Test
    fun `keeps the route a rebuilt screen saved`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)

        assertEquals(SAVED_ROUTE, requests.takeRoute())
    }

    @Test
    fun `ignores the intent that created a rebuilt screen`() {
        requests.takeCreating(SEARCH_REQUEST, REBUILT_SCREEN)

        assertEquals(Pair(emptyList<IconAction>(), SAVED_ROUTE), Pair(chosen.toList(), requests.takeRoute()))
    }

    @Test
    fun `ignores the intent Recents hands back to a fresh screen`() {
        requests.takeCreating(SEARCH_REQUEST.copy(isFromRecents = true), saved = null)

        assertEquals(emptyList<IconAction>(), chosen)
    }

    @Test
    fun `drops the saved route for a shortcut chosen later`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)

        requests.take(SEARCH_REQUEST)

        assertEquals(Pair(listOf(IconAction.SEARCH_LIBRARY), null), Pair(chosen.toList(), requests.takeRoute()))
    }

    @Test
    fun `drops the saved route for a document handed over later`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)

        requests.take(DOCUMENT_REQUEST)

        assertNull(requests.takeRoute())
    }

    @Test
    fun `keeps the saved route for a later intent with no request`() {
        requests.takeCreating(PLAIN_LAUNCH, REBUILT_SCREEN)

        requests.take(PLAIN_LAUNCH)

        assertEquals(SAVED_ROUTE, requests.takeRoute())
    }
}
