package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

private fun version(text: String) = requireNotNull(ReleaseVersion.parse(text)) { "parse $text" }

class ReleaseVersionTest {
    @Test
    fun `orders versions by number, a pre-release before its stable release`() {
        val olderToNewer =
            listOf(
                "0.1.9" to "0.2.0",
                "0.2.0" to "0.10.0",
                "0.9.9" to "1.0.0",
                "1.0.1" to "1.0.10",
                "0.2.0-rc.1" to "0.2.0",
                "0.3.0-rc.1" to "0.3.0-rc-1",
                "0.3.0-rc-1" to "0.3.0-rc-2",
                "0.3.0-rc-1" to "0.3.0",
            )

        olderToNewer.forEach { (older, newer) ->
            assertTrue("$older before $newer", version(older) < version(newer))
        }
    }

    @Test
    fun `orders pre-releases as the semver precedence example does`() {
        val chain =
            listOf(
                "1.0.0-alpha",
                "1.0.0-alpha.1",
                "1.0.0-alpha.beta",
                "1.0.0-beta",
                "1.0.0-beta.2",
                "1.0.0-beta.11",
                "1.0.0-rc.1",
                "1.0.0",
            )

        val sorted =
            chain
                .shuffled(Random(seed = 7))
                .map(::version)
                .sorted()
                .map { it.toString() }

        assertEquals(chain, sorted)
    }

    @Test
    fun `counts a part with a hyphen as text, after every number`() {
        assertTrue(version("0.2.0-rc.1") < version("0.2.0-rc.-1"))
    }

    @Test
    fun `orders numbers too long for a long by their digits`() {
        assertTrue(version("0.2.0-rc.99999999999999999999") < version("0.2.0-rc.100000000000000000000"))
    }

    @Test
    fun `writes the version it read`() {
        val written = listOf("0.2.0", "12.0.3-rc.1", "0.3.0-rc-1").map { version(it).toString() }

        assertEquals(listOf("0.2.0", "12.0.3-rc.1", "0.3.0-rc-1"), written)
    }

    @Test
    fun `reads only three numbers as a version`() {
        val unreadable = listOf("", "1.2", "1.2.3.4", "01.2.3", "1.2.x", "v1.2.3", "1.2.3-", "99999999999.0.0", "0.2.0-rc.01")

        assertEquals(unreadable.map { null }, unreadable.map { ReleaseVersion.parse(it) })
    }

    @Test
    fun `refuses a version it could not write back`() {
        val unwritable = listOf({ ReleaseVersion(-1, 0, 0) }, { ReleaseVersion(0, 2, 0, "rc..1") }, { ReleaseVersion(0, 2, 0, "") })

        unwritable.forEach { assertThrows(IllegalArgumentException::class.java) { it() } }
    }

    @Test
    fun `takes a release tag only as v and a stable version`() {
        val tags = listOf("v1.2.3", "1.2.3", "v1.2.3-rc.1", "release-1.2.3", "v1.2")

        assertEquals(listOf(version("1.2.3"), null, null, null, null), tags.map { ReleaseVersion.fromStableTag(it) })
    }

    @Test
    fun `reads back the stable version its release tag names`() {
        val stable = listOf("0.2.0", "1.0.10", "12.3.4").map(::version)

        assertEquals(stable, stable.map { ReleaseVersion.fromStableTag(it.tag) })
    }

    @Test
    fun `tags a pre-release with its suffix`() {
        assertEquals("v0.3.0-rc.1", version("0.3.0-rc.1").tag)
    }
}
