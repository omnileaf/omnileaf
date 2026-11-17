package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class TextZoomTest {
    @Test
    fun `zooms text by Android's font scale`() {
        assertEquals(130, textZoomFor(1.3f))
    }

    @Test
    fun `drops the part of a percentage below one, as Android's web view does`() {
        assertEquals(123, textZoomFor(1.236f))
    }
}
