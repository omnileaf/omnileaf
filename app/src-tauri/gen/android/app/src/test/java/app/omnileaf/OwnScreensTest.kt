package app.omnileaf

import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Test

class OwnScreensTest {
    @Test
    fun `counts the pickers and the share sheet as Omnileaf's own screens`() {
        val own =
            listOf(
                Intent.ACTION_OPEN_DOCUMENT_TREE,
                Intent.ACTION_OPEN_DOCUMENT,
                Intent.ACTION_CREATE_DOCUMENT,
                Intent.ACTION_GET_CONTENT,
                Intent.ACTION_SEND,
                Intent.ACTION_SEND_MULTIPLE,
                Intent.ACTION_CHOOSER,
            ).map(::isOwnScreen)

        assertEquals(List(own.size) { true }, own)
    }

    @Test
    fun `counts a link in the browser or Android's settings as leaving`() {
        val own = listOf(Intent.ACTION_VIEW, "android.settings.ACCESSIBILITY_SETTINGS", null).map(::isOwnScreen)

        assertEquals(listOf(false, false, false), own)
    }
}
