package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SystemAppLanguageTest {
    @Test
    fun `reads the one language the system's per-app setting names`() {
        assertEquals("pt-BR", firstLanguageTag("pt-BR"))
    }

    @Test
    fun `reads the first of several languages`() {
        assertEquals("de-AT", firstLanguageTag("de-AT,en-GB"))
    }

    @Test
    fun `reads no language when the system's per-app setting names none`() {
        assertNull(firstLanguageTag(""))
    }
}
