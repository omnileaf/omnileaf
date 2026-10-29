package app.omnileaf.folderaccess

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private const val TREE = "content://documents.test/tree/primary%3AComics"
private const val DOCUMENT = "primary:Comics/a.cbz"

class DocumentDeletionTest {
    @Test
    fun `deletes a document through a grant that allows writing`() {
        var deletes = 0

        deleteIfGranted(TREE, DOCUMENT, isWritable = true) {
            deletes++
            true
        }

        assertEquals(1, deletes)
    }

    @Test
    fun `refuses a read only grant without asking the provider`() {
        var isAsked = false

        val outcome =
            runCatching {
                deleteIfGranted(TREE, DOCUMENT, isWritable = false) {
                    isAsked = true
                    true
                }
            }

        assertTrue(outcome.exceptionOrNull() is ReadOnlyGrant)
        assertFalse(isAsked)
    }

    @Test
    fun `refuses a delete the provider answers with false`() {
        val outcome = runCatching { deleteIfGranted(TREE, DOCUMENT, isWritable = true) { false } }

        assertTrue(outcome.exceptionOrNull() is DeleteRefused)
    }
}
