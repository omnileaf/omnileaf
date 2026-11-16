package app.omnileaf

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.io.InterruptedIOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.channels.ServerSocketChannel
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

private const val REPOSITORY = "omnileaf/omnileaf"
private const val LATEST_PATH = "/repos/$REPOSITORY/releases/latest"

private const val HANG_GUARD_MS = 60_000L
private const val DRIP_CHUNK = 8 * 1024
private const val MOST_DRIPPED_AFTER_STOP = MAX_REPLY_BYTES - DRIP_CHUNK

private val INSTALLED = ReleaseVersion(0, 2, 0)
private val PATIENT_READS = FeedTimeouts(connect = Duration.ofSeconds(5), read = Duration.ofDays(1), whole = Duration.ofSeconds(30))

private enum class Stall { NEVER, IN_HEADERS, IN_BODY, DRIPPING }

private data class GitHubReply(
    val status: Int,
    val body: String,
    val headers: Map<String, String> = emptyMap(),
    val stall: Stall = Stall.NEVER,
)

private class ManualWatchdog : Watchdog {
    private val armed = AtomicReference<(() -> Unit)?>()
    var armedFor: Duration? = null
        private set

    override fun arm(
        limit: Duration,
        onExpiry: () -> Unit,
    ): Disarm {
        armedFor = limit
        armed.set(onExpiry)
        return Disarm { armed.set(null) }
    }

    fun expire() {
        armed.get()?.invoke()
    }
}

private class FakeGitHub(
    private val reply: GitHubReply,
    private val onStall: () -> Unit,
) : AutoCloseable {
    private val socket = ServerSocket(0, 1, InetAddress.getLoopbackAddress())
    private val headers = mutableMapOf<String, String>()
    private val closing = CountDownLatch(1)
    private var requestLine: String? = null
    private var drippedAfterStall = 0L
    private val serving = thread { socket.accept().use(::answer) }

    val apiBase: String get() = "http://127.0.0.1:${socket.localPort}"

    fun bytesDrippedAfterStall(): Long {
        serving.join()
        return drippedAfterStall
    }

    fun request(): Pair<String?, Map<String, String>> {
        serving.join()
        return requestLine to headers
    }

    private fun answer(connection: Socket) {
        val reader = connection.getInputStream().bufferedReader()
        requestLine = reader.readLine()
        generateSequence { reader.readLine() }.takeWhile { it.isNotEmpty() }.forEach { line ->
            val (name, value) = line.split(":", limit = 2)
            headers[name.trim().lowercase()] = value.trim()
        }
        val body = reply.body.toByteArray()
        val statusLine = "HTTP/1.1 ${reply.status} Reply\r\n"
        val head =
            buildString {
                append(statusLine)
                reply.headers.forEach { (name, value) -> append("$name: $value\r\n") }
                append("Content-Length: ${body.size}\r\nConnection: close\r\n\r\n")
            }
        try {
            when (reply.stall) {
                Stall.NEVER -> send(connection, head.toByteArray() + body)
                Stall.IN_HEADERS -> stallAfter(connection, statusLine.toByteArray())
                Stall.IN_BODY -> stallAfter(connection, head.toByteArray() + body.copyOf(body.size / 2))
                Stall.DRIPPING -> dripAfterStall(connection, head.toByteArray(), body)
            }
        } catch (_: IOException) {
            return
        }
    }

    private fun send(
        connection: Socket,
        bytes: ByteArray,
    ) {
        connection.getOutputStream().apply {
            write(bytes)
            flush()
        }
    }

    private fun stallAfter(
        connection: Socket,
        bytes: ByteArray,
    ) {
        send(connection, bytes)
        onStall()
        closing.await()
    }

    private fun dripAfterStall(
        connection: Socket,
        head: ByteArray,
        body: ByteArray,
    ) {
        connection.sendBufferSize = DRIP_CHUNK
        send(connection, head + body.copyOf(DRIP_CHUNK))
        onStall()
        val output = connection.getOutputStream()
        for (offset in DRIP_CHUNK until body.size step DRIP_CHUNK) {
            val length = minOf(DRIP_CHUNK, body.size - offset)
            output.write(body, offset, length)
            drippedAfterStall += length
        }
    }

    override fun close() {
        closing.countDown()
        socket.close()
    }
}

private fun dripping() = GitHubReply(200, releaseJson("v0.3.0", body = "a".repeat(4 * MAX_REPLY_BYTES)), stall = Stall.DRIPPING)

private fun releaseJson(
    tag: String,
    body: String = "**Reader:** Smoother pages\\nMore",
) = """{"tag_name":"$tag","draft":false,"prerelease":false,"author":{"login":"a"},"body":"$body","assets":[]}"""

class GitHubReleaseFeedTest {
    private var github: FakeGitHub? = null

    @After
    fun stopGitHub() {
        github?.close()
    }

    private val watchdog = ManualWatchdog()

    private fun checkAgainst(
        reply: GitHubReply,
        onStall: () -> Unit = watchdog::expire,
    ): CheckResult {
        val served = FakeGitHub(reply, onStall).also { github = it }
        val feed = GitHubReleaseFeed(INSTALLED, served.apiBase, REPOSITORY, PATIENT_READS, watchdog)
        return UpdateCheck(feed).check(INSTALLED)
    }

    @Test
    fun `finds a newer published release with its headline`() {
        val result = checkAgainst(GitHubReply(200, releaseJson("v0.3.0")))

        assertEquals(CheckResult.Available(PublishedRelease(ReleaseVersion(0, 3, 0), "Smoother pages")), result)
    }

    @Test
    fun `asks github for json as omnileaf and its version`() {
        checkAgainst(GitHubReply(200, releaseJson("v0.3.0")))

        val (requestLine, headers) = requireNotNull(github).request()
        val sent = listOf("accept", "x-github-api-version", "user-agent").map { headers[it] }
        assertEquals(
            "GET $LATEST_PATH HTTP/1.1" to listOf("application/vnd.github+json", "2022-11-28", "Omnileaf/0.2.0"),
            requestLine to sent,
        )
    }

    @Test
    fun `is up to date when nothing is published yet`() {
        assertEquals(CheckResult.UpToDate, checkAgainst(GitHubReply(404, """{"message":"Not Found"}""")))
    }

    @Test
    fun `is rate limited on a 403 with no requests left`() {
        val reply = GitHubReply(403, "{}", mapOf("x-ratelimit-remaining" to "0"))

        assertEquals(CheckResult.RateLimited, checkAgainst(reply))
    }

    @Test
    fun `is rate limited on a 429`() {
        assertEquals(CheckResult.RateLimited, checkAgainst(GitHubReply(429, "{}")))
    }

    @Test
    fun `fails on any other refusal`() {
        val reply = GitHubReply(403, "{}", mapOf("x-ratelimit-remaining" to "12"))

        assertEquals(CheckResult.Failed(), checkAgainst(reply))
    }

    @Test
    fun `fails on a redirect without following it`() {
        val elsewhere = ServerSocketChannel.open().bind(InetSocketAddress(InetAddress.getLoopbackAddress(), 0))
        elsewhere.configureBlocking(false)
        val location = "http://127.0.0.1:${elsewhere.socket().localPort}$LATEST_PATH"

        val result = checkAgainst(GitHubReply(302, "", mapOf("Location" to location)))

        val followed = elsewhere.use { it.accept() }
        assertEquals(CheckResult.Failed() to null, result to followed)
    }

    @Test(timeout = HANG_GUARD_MS)
    fun `is offline when github stalls in the middle of its headers`() {
        val result = checkAgainst(GitHubReply(200, releaseJson("v0.3.0"), stall = Stall.IN_HEADERS))

        assertEquals(CheckResult.Offline to PATIENT_READS.whole, result to watchdog.armedFor)
    }

    @Test(timeout = HANG_GUARD_MS)
    fun `fails and stays interrupted when the waiting thread is interrupted`() {
        val caller = Thread.currentThread()

        val result = checkAgainst(GitHubReply(200, releaseJson("v0.3.0"), stall = Stall.IN_HEADERS), onStall = caller::interrupt)

        val cause = (result as? CheckResult.Failed)?.cause
        assertEquals(true to true, (cause is InterruptedIOException) to Thread.interrupted())
    }

    @Test(timeout = HANG_GUARD_MS)
    fun `is offline when github stalls in the middle of the release`() {
        assertEquals(CheckResult.Offline, checkAgainst(GitHubReply(200, releaseJson("v0.3.0"), stall = Stall.IN_BODY)))
    }

    @Test(timeout = HANG_GUARD_MS)
    fun `stops reading a release still dripping in once the check has expired`() {
        val result = checkAgainst(dripping())

        val dripped = requireNotNull(github).bytesDrippedAfterStall()
        assertEquals(CheckResult.Offline, result)
        assertTrue("$dripped bytes after the stall", dripped <= MOST_DRIPPED_AFTER_STOP)
    }

    @Test(timeout = HANG_GUARD_MS)
    fun `stops reading a release still dripping in once the waiting thread is interrupted`() {
        val caller = Thread.currentThread()

        val result = checkAgainst(dripping(), onStall = caller::interrupt)

        val isInterrupted = Thread.interrupted()
        val dripped = requireNotNull(github).bytesDrippedAfterStall()
        val cause = (result as? CheckResult.Failed)?.cause
        assertEquals(true to true, (cause is InterruptedIOException) to isInterrupted)
        assertTrue("$dripped bytes after the stall", dripped <= MOST_DRIPPED_AFTER_STOP)
    }

    @Test
    fun `lets a failure that is not about the connection through as itself`() {
        val feed = GitHubReleaseFeed(INSTALLED, apiBase = "file:///nowhere", repository = REPOSITORY, watchdog = watchdog)

        assertThrows(ClassCastException::class.java) { UpdateCheck(feed).check(INSTALLED) }
    }

    @Test
    fun `fails on a sign-in page served in place of github`() {
        val portal = GitHubReply(200, "<html><body>Sign in to the wifi</body></html>", mapOf("Content-Type" to "text/html"))

        assertEquals(CheckResult.Failed(), checkAgainst(portal))
    }

    @Test
    fun `fails on a reply too long to read whole`() {
        val padded = releaseJson("v0.3.0", body = "a".repeat(MAX_REPLY_BYTES))

        val result = checkAgainst(GitHubReply(200, padded))

        assertTrue("$result", result is CheckResult.Failed && result.cause != null)
    }
}
