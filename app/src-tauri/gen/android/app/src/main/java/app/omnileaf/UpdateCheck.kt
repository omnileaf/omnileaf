package app.omnileaf

import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

private const val TOO_MANY_REQUESTS = 429
private const val MAX_JSON_DEPTH = 32
private val CONNECTIVITY_FAILURES =
    listOf(
        UnknownHostException::class,
        ConnectException::class,
        SocketTimeoutException::class,
        NoRouteToHostException::class,
    )

internal data class FeedReply(
    val status: Int,
    val rateLimitRemaining: Int?,
    val body: String,
)

internal fun interface ReleaseFeed {
    @Throws(IOException::class)
    fun fetchLatest(): FeedReply
}

internal sealed interface CheckResult {
    data object UpToDate : CheckResult

    data class Available(
        val release: PublishedRelease,
    ) : CheckResult

    data object Offline : CheckResult

    data object RateLimited : CheckResult

    data class Failed(
        val cause: IOException? = null,
    ) : CheckResult
}

internal class UpdateCheck(
    private val feed: ReleaseFeed,
) {
    fun check(installed: ReleaseVersion): CheckResult {
        val reply =
            try {
                feed.fetchLatest()
            } catch (failure: IOException) {
                return if (failure.isConnectivity()) CheckResult.Offline else CheckResult.Failed(failure)
            }
        return when {
            reply.status == HttpURLConnection.HTTP_OK -> judge(reply.body, installed)
            reply.status == HttpURLConnection.HTTP_NOT_FOUND -> CheckResult.UpToDate
            reply.status == TOO_MANY_REQUESTS -> CheckResult.RateLimited
            reply.status == HttpURLConnection.HTTP_FORBIDDEN && reply.rateLimitRemaining == 0 -> CheckResult.RateLimited
            else -> CheckResult.Failed()
        }
    }

    private fun judge(
        body: String,
        installed: ReleaseVersion,
    ): CheckResult {
        val release = jsonObject(body) ?: return CheckResult.Failed()
        val published = stableRelease(release)
        return if (published != null && published.version > installed) CheckResult.Available(published) else CheckResult.UpToDate
    }
}

private fun IOException.isConnectivity(): Boolean = CONNECTIVITY_FAILURES.any { it.isInstance(this) }

private fun stableRelease(release: JSONObject): PublishedRelease? {
    val isPublished = release.optBoolean("draft", true).not() && release.optBoolean("prerelease", true).not()
    val version = ReleaseVersion.fromStableTag(release.optString("tag_name"))?.takeIf { isPublished } ?: return null
    val notes = if (release.isNull("body")) null else release.optString("body")
    return PublishedRelease(version, releaseHeadline(notes))
}

private fun jsonObject(text: String): JSONObject? {
    if (!isNestedWithin(text, MAX_JSON_DEPTH)) return null
    return try {
        JSONObject(text)
    } catch (_: JSONException) {
        null
    }
}
