package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException

class UpdateCheckFailureTest {
    @Test
    fun `names an interrupted check as interrupted`() {
        val reason = updateCheckFailure(InterruptedIOException("the release check was interrupted"))

        assertEquals(LogReason.INTERRUPTED, reason)
    }

    @Test
    fun `names a timed out check as a timeout, not an interruption`() {
        val reason = updateCheckFailure(SocketTimeoutException("the release check took longer than 30 s"))

        assertEquals(LogReason.TIMEOUT, reason)
    }

    @Test
    fun `names any other failure an io error, whatever its message holds`() {
        val reason = updateCheckFailure(IOException("the release reply exceeds 1048576 bytes"))

        assertEquals(LogReason.IO_ERROR, reason)
    }
}
