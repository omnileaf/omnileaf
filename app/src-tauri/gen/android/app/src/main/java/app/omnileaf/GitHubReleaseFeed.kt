package app.omnileaf

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.InterruptedIOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URI
import java.time.Duration
import java.util.concurrent.Callable
import java.util.concurrent.CancellationException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import java.util.concurrent.FutureTask

internal const val MAX_REPLY_BYTES = 1024 * 1024
private const val GITHUB_API = "https://api.github.com"
private const val OMNILEAF_REPOSITORY = "omnileaf/omnileaf"
private const val RATE_LIMIT_REMAINING = "x-ratelimit-remaining"
private const val END_OF_STREAM = -1
private val ON_ITS_OWN_THREAD = Executor { task -> Thread(task, "release-check").apply { isDaemon = true }.start() }

internal data class FeedTimeouts(
    val connect: Duration,
    val read: Duration,
    val whole: Duration,
) {
    companion object {
        val GITHUB = FeedTimeouts(connect = Duration.ofSeconds(5), read = Duration.ofSeconds(20), whole = Duration.ofSeconds(30))
    }
}

internal class GitHubReleaseFeed(
    private val installed: ReleaseVersion,
    apiBase: String = GITHUB_API,
    repository: String = OMNILEAF_REPOSITORY,
    private val timeouts: FeedTimeouts = FeedTimeouts.GITHUB,
    private val watchdog: Watchdog = ScheduledWatchdog,
) : ReleaseFeed {
    private val latestUrl = URI("$apiBase/repos/$repository/releases/latest").toURL()

    private val headers =
        mapOf(
            "Accept" to "application/vnd.github+json",
            "X-GitHub-Api-Version" to "2022-11-28",
            "User-Agent" to "Omnileaf/$installed",
        )

    override fun fetchLatest(): FeedReply {
        val fetch = FutureTask(Callable(::request))
        val alarm = watchdog.arm(timeouts.whole) { fetch.cancel(true) }
        try {
            ON_ITS_OWN_THREAD.execute(fetch)
            return fetch.awaitReply()
        } finally {
            alarm.disarm()
        }
    }

    private fun FutureTask<FeedReply>.awaitReply(): FeedReply =
        try {
            get()
        } catch (expired: CancellationException) {
            throw SocketTimeoutException("the release check took longer than ${timeouts.whole}").apply { initCause(expired) }
        } catch (interrupted: InterruptedException) {
            cancel(true)
            Thread.currentThread().interrupt()
            throw InterruptedIOException("the release check was interrupted").apply { initCause(interrupted) }
        } catch (failure: ExecutionException) {
            throw (failure.cause as? IOException) ?: IOException("the release check failed", failure.cause ?: failure)
        }

    private fun request(): FeedReply {
        val connection = latestUrl.openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = timeouts.connect.toMillis().toInt()
            connection.readTimeout = timeouts.read.toMillis().toInt()
            connection.useCaches = false
            headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
            val status = connection.responseCode
            val stream: InputStream? = if (status < HttpURLConnection.HTTP_BAD_REQUEST) connection.inputStream else connection.errorStream
            val body = stream?.use { it.readAtMost(MAX_REPLY_BYTES).toString(Charsets.UTF_8) }.orEmpty()
            return FeedReply(status, connection.getHeaderField(RATE_LIMIT_REMAINING)?.toIntOrNull(), body)
        } finally {
            connection.disconnect()
        }
    }
}

private fun InputStream.readAtMost(limit: Int): ByteArray {
    val kept = ByteArrayOutputStream()
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    while (kept.size() < limit) {
        if (Thread.currentThread().isInterrupted) throw InterruptedIOException("the release check stopped reading")
        val read = read(buffer, 0, minOf(buffer.size, limit - kept.size()))
        if (read < 0) return kept.toByteArray()
        kept.write(buffer, 0, read)
    }
    if (read() != END_OF_STREAM) throw IOException("the release reply exceeds $limit bytes")
    return kept.toByteArray()
}
