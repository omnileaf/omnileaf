package app.omnileaf.folderaccess

import org.junit.Assert.assertEquals
import org.junit.Test

class PickerStartTest {
    @Test
    fun `starts at the folder that held a lost folder`() {
        assertEquals("primary:Books", parentDocumentId("primary:Books/Saga"))
    }

    @Test
    fun `starts at the volume when the lost folder sat at its top`() {
        assertEquals("primary:", parentDocumentId("primary:Saga"))
    }

    @Test
    fun `keeps a document id it cannot split`() {
        assertEquals("home", parentDocumentId("home"))
    }
}
