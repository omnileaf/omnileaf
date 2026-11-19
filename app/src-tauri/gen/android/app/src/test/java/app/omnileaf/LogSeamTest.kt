package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

private val FULL_NAME_LOG_CALL = Regex("""\b(android\.util\.Log|app\.tauri\.Logger)\.""")

class LogSeamTest {
    @Test
    fun `calls the system log by its full name only inside the log seam`() {
        assertTrue(File("src/main/java/app/omnileaf/PrivateLog.kt").isFile)

        val callers =
            File("src/main/java")
                .walk()
                .filter { it.extension == "kt" && it.name != "PrivateLog.kt" && "generated" !in it.invariantSeparatorsPath }
                .filter { FULL_NAME_LOG_CALL.containsMatchIn(it.readText()) }
                .map { it.name }
                .toList()

        assertEquals(emptyList<String>(), callers)
    }
}
