package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val VIEW = "android.intent.action.VIEW"
private const val SEND = "android.intent.action.SEND"
private const val MAIN = "android.intent.action.MAIN"
private const val DOCUMENT = "content://documents.test/document/42"
private const val OTHER_DOCUMENT = "content://documents.test/document/43"

class HandedDocumentIntentTest {
    @Test
    fun `reads the document an open with request carries as its data`() {
        val incoming = IncomingIntent(action = VIEW, data = DOCUMENT, stream = null)

        assertEquals(DOCUMENT, incoming.handedDocument())
    }

    @Test
    fun `reads the document a share request carries as its stream`() {
        val incoming = IncomingIntent(action = SEND, data = null, stream = DOCUMENT)

        assertEquals(DOCUMENT, incoming.handedDocument())
    }

    @Test
    fun `reads only the data of an open with request`() {
        val incoming = IncomingIntent(action = VIEW, data = DOCUMENT, stream = OTHER_DOCUMENT)

        assertEquals(DOCUMENT, incoming.handedDocument())
    }

    @Test
    fun `reads only the stream of a share request`() {
        val incoming = IncomingIntent(action = SEND, data = OTHER_DOCUMENT, stream = DOCUMENT)

        assertEquals(DOCUMENT, incoming.handedDocument())
    }

    @Test
    fun `hands over nothing when an open with request has no data`() {
        val incoming = IncomingIntent(action = VIEW, data = null, stream = null)

        assertNull(incoming.handedDocument())
    }

    @Test
    fun `hands over nothing when a share request has no stream`() {
        val incoming = IncomingIntent(action = SEND, data = null, stream = null)

        assertNull(incoming.handedDocument())
    }

    @Test
    fun `hands over nothing for an address that is not a content address`() {
        val addresses = listOf("file:///sdcard/Download/Sample.cbz", "https://example.com/Sample.cbz", "Sample.cbz")

        val handed = addresses.map { IncomingIntent(action = VIEW, data = it, stream = null).handedDocument() }

        assertEquals(listOf(null, null, null), handed)
    }

    @Test
    fun `accepts a content scheme written in capitals`() {
        val incoming = IncomingIntent(action = VIEW, data = "CONTENT://documents.test/document/42", stream = null)

        assertEquals("CONTENT://documents.test/document/42", incoming.handedDocument())
    }

    @Test
    fun `hands over nothing for the launcher intent`() {
        val incoming = IncomingIntent(action = MAIN, data = DOCUMENT, stream = DOCUMENT)

        assertNull(incoming.handedDocument())
    }

    @Test
    fun `hands over nothing for an intent with no action`() {
        val incoming = IncomingIntent(action = null, data = DOCUMENT, stream = null)

        assertNull(incoming.handedDocument())
    }
}
