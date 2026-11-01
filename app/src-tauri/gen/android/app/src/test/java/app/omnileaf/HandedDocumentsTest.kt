package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

private const val DOCUMENT = "content://documents.test/document/42"
private const val OTHER_DOCUMENT = "content://documents.test/document/43"

class HandedDocumentsTest {
    private val handed = mutableListOf<String>()

    @Test
    fun `keeps a document until the page is watching and then hands it over`() {
        val documents = HandedDocuments()
        documents.receive(DOCUMENT)

        documents.watch { handed.add(it) }

        assertEquals(listOf(DOCUMENT), handed)
    }

    @Test
    fun `hands over a document the moment it arrives while the page is watching`() {
        val documents = HandedDocuments()
        documents.watch { handed.add(it) }

        documents.receive(DOCUMENT)

        assertEquals(listOf(DOCUMENT), handed)
    }

    @Test
    fun `hands over a waiting document only once`() {
        val documents = HandedDocuments()
        documents.receive(DOCUMENT)
        documents.watch { handed.add(it) }

        documents.watch { handed.add(it) }

        assertEquals(listOf(DOCUMENT), handed)
    }

    @Test
    fun `hands over only the latest of several documents that arrive before the page watches`() {
        val documents = HandedDocuments()
        documents.receive(DOCUMENT)
        documents.receive(OTHER_DOCUMENT)

        documents.watch { handed.add(it) }

        assertEquals(listOf(OTHER_DOCUMENT), handed)
    }

    @Test
    fun `hands over each document that arrives while the page is watching`() {
        val documents = HandedDocuments()
        documents.watch { handed.add(it) }

        documents.receive(DOCUMENT)
        documents.receive(OTHER_DOCUMENT)

        assertEquals(listOf(DOCUMENT, OTHER_DOCUMENT), handed)
    }

    @Test
    fun `hands over nothing when no document arrived`() {
        val documents = HandedDocuments()

        documents.watch { handed.add(it) }

        assertEquals(emptyList<String>(), handed)
    }

    @Test
    fun `hands a later document to the page that watches last`() {
        val documents = HandedDocuments()
        val earlierPage = mutableListOf<String>()
        documents.watch { earlierPage.add(it) }
        documents.watch { handed.add(it) }

        documents.receive(DOCUMENT)

        assertEquals(listOf(emptyList(), listOf(DOCUMENT)), listOf(earlierPage, handed))
    }
}
