package app.omnileaf.folderaccess

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HandedDocumentTest {
    @Test
    fun `takes a content address`() {
        val outcome = runCatching { requireContentScheme("content://documents.test/document/42", "content") }

        assertTrue(outcome.isSuccess)
    }

    @Test
    fun `refuses an address that would reach the apps own files`() {
        val outcomes =
            listOf("file", "http", null).map { scheme ->
                runCatching { requireContentScheme("$scheme:///data/data/app.omnileaf", scheme) }
                    .exceptionOrNull()
            }

        assertEquals(listOf(true, true, true), outcomes.map { it is SecurityException })
    }

    @Test
    fun `reports a refused address as permission denied`() {
        val refusal = refusalOf(SecurityException("file:///a isn't a content address"))

        assertEquals("permissionDenied", refusal.code)
    }
}
