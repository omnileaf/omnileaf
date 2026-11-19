package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class ReleasePageTest {
    @Test
    fun `points at the github release of a stable version`() {
        val address = releasePageAddress(ReleaseVersion(0, 3, 1))

        assertEquals("https://github.com/omnileaf/omnileaf/releases/tag/v0.3.1", address)
    }

    @Test
    fun `has no page for a pre-release`() {
        val address = releasePageAddress(ReleaseVersion(0, 3, 0, "rc.1"))

        assertEquals(null, address)
    }
}
