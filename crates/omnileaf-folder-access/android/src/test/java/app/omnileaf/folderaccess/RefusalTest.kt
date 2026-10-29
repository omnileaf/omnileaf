package app.omnileaf.folderaccess

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.FileNotFoundException
import java.io.IOException
import kotlin.time.Duration.Companion.seconds

class RefusalTest {
    @Test
    fun `reports a revoked grant as permission denied`() {
        val refusal = refusalOf(SecurityException("grant revoked"))

        assertEquals(Refusal("grant revoked", "permissionDenied"), refusal)
    }

    @Test
    fun `reports a document the provider cannot find as not found`() {
        val refusal = refusalOf(FileNotFoundException("no such document"))

        assertEquals(Refusal("no such document", "notFound"), refusal)
    }

    @Test
    fun `reports a delete the provider refused by its own code`() {
        val refusal = refusalOf(DeleteRefused("primary:Comics/a.cbz"))

        assertEquals("deleteRefused", refusal.code)
    }

    @Test
    fun `reports a provider that cannot delete as a delete it refused`() {
        val refusal = refusalOf(UnsupportedOperationException("Delete not supported"))

        assertEquals(Refusal("Delete not supported", "deleteRefused"), refusal)
    }

    @Test
    fun `reports a listing still loading as incomplete`() {
        val refusal = refusalOf(ListingIncomplete("content://documents.test/tree/primary%3AComics/children"))

        assertEquals("incomplete", refusal.code)
    }

    @Test
    fun `reports a read only grant by its own code`() {
        val refusal = refusalOf(ReadOnlyGrant("content://documents.test/tree/primary%3AComics"))

        assertEquals("readOnlyGrant", refusal.code)
    }

    @Test
    fun `reports a call that ran past its bound as timed out`() {
        val refusal = refusalOf(CallTimedOut(20.seconds))

        assertEquals("timedOut", refusal.code)
    }

    @Test
    fun `gives an unexpected failure its message and no code`() {
        val refusal = refusalOf(IOException("disk on fire"))

        assertEquals("disk on fire", refusal.message)
        assertNull(refusal.code)
    }

    @Test
    fun `names an unexpected failure that has no message by its type`() {
        val refusal = refusalOf(IllegalStateException())

        assertEquals("java.lang.IllegalStateException", refusal.message)
    }
}
