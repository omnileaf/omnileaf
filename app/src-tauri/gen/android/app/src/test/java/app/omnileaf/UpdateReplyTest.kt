package app.omnileaf

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

private fun JSONObject.fields(): Map<String, Any?> =
    keys().asSequence().associateWith { key -> get(key).let { if (it is JSONObject) it.fields() else it } }

private fun assertJson(
    expected: String,
    actual: JSONObject,
) = assertEquals(JSONObject(expected).fields(), actual.fields())

class UpdateReplyTest {
    @Test
    fun `tells the app whether checks are automatic and nothing is known yet`() {
        val reply = statusReply(UpdateStatus.Unchecked, isAutomatic = true)

        assertJson("""{"isAutomatic":true,"release":{"kind":"unchecked"}}""", reply)
    }

    @Test
    fun `tells the app the installed version is the latest`() {
        val reply = statusReply(UpdateStatus.UpToDate, isAutomatic = false)

        assertJson("""{"isAutomatic":false,"release":{"kind":"upToDate"}}""", reply)
    }

    @Test
    fun `names a newer release with its headline, its page and how its notice stands`() {
        val newer = PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages")

        val replies = Notice.entries.map { statusReply(UpdateStatus.Newer(newer, it), isAutomatic = false).getJSONObject("release") }

        val page = "https://github.com/omnileaf/omnileaf/releases/tag/v0.3.0"
        val expected =
            listOf("shown", "snoozed", "skipped").map {
                JSONObject("""{"kind":"newer","version":"0.3.0","headline":"Smoother pages","releasePage":"$page","notice":"$it"}""")
            }
        assertEquals(expected.map { it.fields() }, replies.map { it.fields() })
    }

    @Test
    fun `sends a missing headline as null`() {
        val newer = PublishedRelease(ReleaseVersion(0, 3, 0), null)

        val release = statusReply(UpdateStatus.Newer(newer, Notice.SHOWN), isAutomatic = false).getJSONObject("release")

        assertEquals(true, release.has("headline") && release.isNull("headline"))
    }

    @Test
    fun `sends no release page for a pre-release`() {
        val newer = PublishedRelease(ReleaseVersion(0, 3, 0, "rc.1"), null)

        val release = statusReply(UpdateStatus.Newer(newer, Notice.SHOWN), isAutomatic = false).getJSONObject("release")

        assertEquals(true, release.has("releasePage") && release.isNull("releasePage"))
    }

    @Test
    fun `names how each check ended beside the status it left`() {
        val status = statusReply(UpdateStatus.UpToDate, isAutomatic = false)
        val results =
            listOf(
                CheckResult.UpToDate,
                CheckResult.Available(PublishedRelease(ReleaseVersion(0, 3, 0), null)),
                CheckResult.Offline,
                CheckResult.RateLimited,
                CheckResult.Failed(),
            )

        val outcomes = results.map { checkReply(it, status).getString("outcome") }

        assertEquals(listOf("upToDate", "available", "offline", "rateLimited", "failed"), outcomes)
    }

    @Test
    fun `sends no outcome when no check ran`() {
        val status = statusReply(UpdateStatus.UpToDate, isAutomatic = false)

        val reply = checkReply(null, status)

        assertJson("""{"outcome":null,"status":{"isAutomatic":false,"release":{"kind":"upToDate"}}}""", reply)
    }
}
