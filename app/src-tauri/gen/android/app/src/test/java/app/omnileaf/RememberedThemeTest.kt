package app.omnileaf

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class RememberedThemeTest {
    @Test
    fun `reads a theme it kept`() {
        val read = StartingTheme.entries.map { storedStartingTheme(it.name) }

        assertEquals(StartingTheme.entries, read)
    }

    @Test
    fun `reads nothing before a theme was kept, or from an unknown name`() {
        val read = listOf(null, "SEPIA").map(::storedStartingTheme)

        assertEquals(listOf(null, null), read)
    }

    @Test
    fun `tells the app the theme it kept, by name`() {
        val reply = rememberedThemeReply(StartingTheme.LIGHT)

        assertEquals("LIGHT", reply.getString("theme"))
    }

    @Test
    fun `tells the app it kept no theme yet`() {
        val reply = rememberedThemeReply(null)

        assertEquals(JSONObject.NULL, reply.get("theme"))
    }
}
