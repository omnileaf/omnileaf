package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException

private val INSTALLED = ReleaseVersion(0, 2, 0)

private fun releaseJson(
    tag: String,
    draft: Boolean = false,
    prerelease: Boolean = false,
    extra: String = "",
) = """{"tag_name":"$tag","draft":$draft,"prerelease":$prerelease,"body":"Faster library"$extra}"""

private fun checkOf(body: String): CheckResult = UpdateCheck { FeedReply(200, null, body) }.check(INSTALLED)

private fun checkFailing(failure: IOException): CheckResult = UpdateCheck { throw failure }.check(INSTALLED)

class UpdateCheckTest {
    @Test
    fun `is up to date when the latest release is the installed one or older`() {
        val results = listOf("v0.2.0", "v0.1.9").map { checkOf(releaseJson(it)) }

        assertEquals(listOf(CheckResult.UpToDate, CheckResult.UpToDate), results)
    }

    @Test
    fun `is up to date when the latest release is a draft, a pre-release or not a stable version`() {
        val bodies =
            listOf(
                releaseJson("v0.3.0", draft = true),
                releaseJson("v0.3.0", prerelease = true),
                releaseJson("v0.3.0-rc.1"),
                releaseJson("nightly"),
                """{"tag_name":"v0.3.0"}""",
            )

        assertEquals(bodies.map { CheckResult.UpToDate }, bodies.map(::checkOf))
    }

    @Test
    fun `fails on a reply that is not a json object`() {
        val bodies = listOf("[]", "<html>Sign in</html>", """{"tag_name":"v0.3""")

        assertEquals(bodies.map { CheckResult.Failed() }, bodies.map(::checkOf))
    }

    @Test
    fun `fails on a reply nested deeper than a release ever is`() {
        val deep = releaseJson("v0.3.0", extra = ""","extra":${"[".repeat(32)}${"]".repeat(32)}""")
        val bottomless = "[".repeat(500_000)

        assertEquals(listOf(CheckResult.Failed(), CheckResult.Failed()), listOf(checkOf(deep), checkOf(bottomless)))
    }

    @Test
    fun `finds a release nested exactly as deep as allowed`() {
        val atLimit = releaseJson("v0.3.0", extra = ""","extra":${"[".repeat(31)}${"]".repeat(31)}""")

        assertEquals(CheckResult.Available(PublishedRelease(ReleaseVersion(0, 3, 0), "Faster library")), checkOf(atLimit))
    }

    @Test
    fun `reads the reply status before the release`() {
        val replies =
            listOf(
                FeedReply(404, null, ""),
                FeedReply(429, null, ""),
                FeedReply(403, 0, ""),
                FeedReply(403, 12, ""),
                FeedReply(500, null, ""),
            )

        val results = replies.map { reply -> UpdateCheck { reply }.check(INSTALLED) }

        val expected =
            listOf(CheckResult.UpToDate, CheckResult.RateLimited, CheckResult.RateLimited, CheckResult.Failed(), CheckResult.Failed())
        assertEquals(expected, results)
    }

    @Test
    fun `counts no brackets inside strings toward the nesting`() {
        val bracketed = releaseJson("v0.3.0", extra = ""","notes":"\"${"[{".repeat(40)}"""")

        assertEquals(CheckResult.Available(PublishedRelease(ReleaseVersion(0, 3, 0), "Faster library")), checkOf(bracketed))
    }

    @Test
    fun `finds a release with no notes and no headline`() {
        val result = checkOf("""{"tag_name":"v0.3.0","draft":false,"prerelease":false,"body":null}""")

        assertEquals(CheckResult.Available(PublishedRelease(ReleaseVersion(0, 3, 0), null)), result)
    }

    @Test
    fun `is offline only when github cannot be reached`() {
        val unreachable = listOf(UnknownHostException(), ConnectException(), NoRouteToHostException(), SocketTimeoutException())

        assertEquals(unreachable.map { CheckResult.Offline }, unreachable.map(::checkFailing))
    }

    @Test
    fun `fails with the cause on any other connection error`() {
        val handshake = SSLHandshakeException("certificate rejected")

        assertEquals(CheckResult.Failed(handshake), checkFailing(handshake))
    }
}
