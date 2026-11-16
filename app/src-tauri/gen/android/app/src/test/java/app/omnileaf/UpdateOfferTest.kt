package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Duration
import java.time.Instant

private val NOW: Instant = Instant.parse("2026-11-16T09:00:00Z")

private fun version(text: String) = requireNotNull(ReleaseVersion.parse(text)) { "parse $text" }

private fun release(text: String) = PublishedRelease(version(text), headline = null)

private val NO_CHOICES = UpdateChoices(skipped = null, snooze = null)

private fun skipped(text: String) = UpdateChoices(skipped = version(text), snooze = null)

private fun snoozed(
    text: String,
    ago: Duration,
) = UpdateChoices(skipped = null, snooze = Snooze(version(text), NOW - ago))

private fun UpdateChoices.offered(
    installed: String,
    latest: String?,
): String? = offer(version(installed), latest?.let(::release), NOW)?.version?.toString()

class UpdateOfferTest {
    @Test
    fun `offers a release newer than the installed version`() {
        val offers = listOf(NO_CHOICES.offered("0.2.0", "0.3.0"), NO_CHOICES.offered("0.3.0-rc.1", "0.3.0"))

        assertEquals(listOf("0.3.0", "0.3.0"), offers)
    }

    @Test
    fun `offers nothing once the installed version has caught up`() {
        val offers = listOf(NO_CHOICES.offered("0.3.0", "0.3.0"), NO_CHOICES.offered("0.4.0", "0.3.0"), NO_CHOICES.offered("0.2.0", null))

        assertEquals(listOf(null, null, null), offers)
    }

    @Test
    fun `hides a skipped version`() {
        assertEquals(null, skipped("0.3.0").offered("0.2.0", "0.3.0"))
    }

    @Test
    fun `hides a snoozed version while the snooze lasts`() {
        assertEquals(null, snoozed("0.3.0", Duration.ofDays(6)).offered("0.2.0", "0.3.0"))
    }

    @Test
    fun `offers a snoozed version again after seven days`() {
        assertEquals("0.3.0", snoozed("0.3.0", Duration.ofDays(7)).offered("0.2.0", "0.3.0"))
    }

    @Test
    fun `ends a snooze taken in the future after the clock moved back`() {
        assertEquals("0.3.0", snoozed("0.3.0", Duration.ofDays(-1)).offered("0.2.0", "0.3.0"))
    }

    @Test
    fun `offers a version newer than the skipped or snoozed one`() {
        val offers = listOf(skipped("0.3.0").offered("0.2.0", "0.4.0"), snoozed("0.3.0", Duration.ofDays(1)).offered("0.2.0", "0.4.0"))

        assertEquals(listOf("0.4.0", "0.4.0"), offers)
    }
}
