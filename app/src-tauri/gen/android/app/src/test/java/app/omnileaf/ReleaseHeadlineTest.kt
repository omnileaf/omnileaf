package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class ReleaseHeadlineTest {
    @Test
    fun `takes the first line with words in it`() {
        assertEquals("Faster library", releaseHeadline("\n  \nFaster library\nMore below"))
    }

    @Test
    fun `skips a line of marks only`() {
        assertEquals("Faster library", releaseHeadline("---\nFaster library"))
    }

    @Test
    fun `drops heading and list marks and a bold area label`() {
        val bodies =
            listOf(
                "## What's new\nSections as tabs",
                "- Sections as tabs",
                "* Sections as tabs",
                "- **Reader:** Smoother pages",
                "**Library:** Covers",
            )

        val headlines = bodies.map { releaseHeadline(it) }

        assertEquals(listOf("Sections as tabs", "Sections as tabs", "Sections as tabs", "Smoother pages", "Covers"), headlines)
    }

    @Test
    fun `takes the summary above the release notes`() {
        val notes = "Smoother reading everywhere\n\n## New\n- **Reader:** Page turns follow your finger"

        assertEquals("Smoother reading everywhere", releaseHeadline(notes))
    }

    @Test
    fun `takes the first change under generated notes`() {
        val generated = "## What's Changed\n* Faster covers by someone in #12\n\n**Full Changelog**: v0.1.0...v0.2.0"

        assertEquals("Faster covers by someone in #12", releaseHeadline(generated))
    }

    @Test
    fun `cuts a long line to 300 characters`() {
        assertEquals("a".repeat(300), releaseHeadline("a".repeat(400)))
    }

    @Test
    fun `keeps a character whole where the cut falls`() {
        assertEquals("a".repeat(299), releaseHeadline("a".repeat(299) + "📚 more"))
    }

    @Test
    fun `gives no headline for an empty body`() {
        assertEquals(listOf(null, null), listOf(releaseHeadline(null), releaseHeadline(" \n\n")))
    }
}
