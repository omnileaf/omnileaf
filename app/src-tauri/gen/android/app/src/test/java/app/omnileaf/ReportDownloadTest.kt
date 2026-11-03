package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
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

        val kept = saveToDownloads(MIN_DOWNLOADS_SDK, writer, "omnileaf-report-2026-10-16.txt", "the report")

        assertEquals("omnileaf-report-2026-10-16 (1).txt", kept)
        assertEquals(listOf(Triple("omnileaf-report-2026-10-16.txt", "text/plain", "the report")), written)
    }

    @Test
    fun `refuses on a phone older than the Downloads collection`() {
        val writer = DownloadWriter { _, _, _ -> error("must not write") }

        assertThrows(UnsupportedOperationException::class.java) {
            saveToDownloads(MIN_DOWNLOADS_SDK - 1, writer, "report.txt", "text")
        }
    }
}
