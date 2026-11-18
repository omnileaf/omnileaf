package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.lang.reflect.Modifier

class PrivateLogTest {
    private val written = mutableListOf<Pair<LogLevel, String>>()
    private val log = PrivateLog { level, line -> written += level to line }

    @Test
    fun `writes a warning as its event and reason, nothing else`() {
        log.warn(LogEvent.SCREEN_LOCK_PROMPT_FAILED, LogReason.LOCKOUT)

        assertEquals(listOf(LogLevel.WARNING to "screen_lock_prompt_failed reason=lockout"), written)
    }

    @Test
    fun `writes an error as its event and reason, nothing else`() {
        log.error(LogEvent.SCREEN_LOCK_PROMPT_FAILED, LogReason.UNKNOWN)

        assertEquals(listOf(LogLevel.ERROR to "screen_lock_prompt_failed reason=unknown"), written)
    }

    @Test
    fun `takes only fixed events and reasons, so no free text can reach the log`() {
        val parameterTypes =
            PrivateLog::class.java.declaredMethods
                .filter { Modifier.isPublic(it.modifiers) }
                .flatMap { it.parameterTypes.toList() }
                .toSet()

        assertEquals(setOf(LogEvent::class.java, LogReason::class.java), parameterTypes)
    }

    @Test
    fun `names every event and reason in lowercase words joined by underscores`() {
        val ids = LogEvent.entries.map { it.id } + LogReason.entries.map { it.id }

        assertEquals(emptyList<String>(), ids.filterNot { it.matches(Regex("[a-z]+(_[a-z]+)*")) })
    }
}
