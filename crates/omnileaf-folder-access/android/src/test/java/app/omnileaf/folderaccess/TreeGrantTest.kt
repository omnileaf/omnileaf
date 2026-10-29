package app.omnileaf.folderaccess

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class TreeGrantTest {
    @Test
    fun `takes read and write together when the provider allows both`() {
        val attempts = mutableListOf<Int>()

        takeTreeGrant { flags -> attempts += flags }

        assertEquals(listOf(READ_WRITE_GRANT), attempts)
    }

    @Test
    fun `falls back to a read grant when the provider refuses to persist writing`() {
        val attempts = mutableListOf<Int>()

        takeTreeGrant { flags ->
            attempts += flags
            if (flags == READ_WRITE_GRANT) throw SecurityException("write not granted")
        }

        assertEquals(listOf(READ_WRITE_GRANT, READ_GRANT), attempts)
    }

    @Test
    fun `fails when even a read grant cannot be taken`() {
        val error =
            assertThrows(SecurityException::class.java) {
                takeTreeGrant { throw SecurityException("no grant") }
            }

        assertEquals("no grant", error.message)
    }
}
