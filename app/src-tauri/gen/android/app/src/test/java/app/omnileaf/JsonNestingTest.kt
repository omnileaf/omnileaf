package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

private const val LIMIT = 32
private val BOTTOMLESS = "[".repeat(100)

class JsonNestingTest {
    @Test
    fun `accepts json nested up to the limit`() {
        val atLimit = "[".repeat(LIMIT) + "]".repeat(LIMIT)

        assertEquals(true, isNestedWithin(atLimit, LIMIT))
    }

    @Test
    fun `refuses a quote hidden in a single-quoted string`() {
        assertEquals(false, isNestedWithin("""{'a':'"','b':$BOTTOMLESS""", LIMIT))
    }

    @Test
    fun `refuses comments that could hide a quote`() {
        val comments = listOf("""{"a":1 /* " */,"b":$BOTTOMLESS""", "{\"a\":1 # \"\n,\"b\":$BOTTOMLESS", """{"a":1 // """")

        assertEquals(comments.map { false }, comments.map { isNestedWithin(it, LIMIT) })
    }

    @Test
    fun `refuses a quote glued to a value`() {
        assertEquals(false, isNestedWithin("""{"a":"x""$BOTTOMLESS"}""", LIMIT))
    }

    @Test
    fun `refuses a quote after a space json does not skip`() {
        assertEquals(false, isNestedWithin("{\"a\":[\u00A0\",$BOTTOMLESS", LIMIT))
    }

    @Test
    fun `refuses more closing brackets than opening ones`() {
        assertEquals(false, isNestedWithin("]".repeat(40) + "[".repeat(40), LIMIT))
    }
}
