package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class ReportDownloadTest {
    @Test
    fun `hands the text to the writer and returns the name the store kept`() {
        val written = mutableListOf<Triple<String, String, String>>()
        val writer =
            DownloadWriter { name, mime, text ->
                written += Triple(name, mime, text)
                "omnileaf-report-2026-10-16 (1).txt"
            }

        val kept = saveToDownloads(writer, "omnileaf-report-2026-10-16.txt", "the report")

        assertEquals("omnileaf-report-2026-10-16 (1).txt", kept)
        assertEquals(listOf(Triple("omnileaf-report-2026-10-16.txt", "text/plain", "the report")), written)
    }
}
