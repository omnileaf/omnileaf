package app.omnileaf

import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException

internal fun updateCheckFailure(failure: IOException): LogReason =
    when (failure) {
        is SocketTimeoutException -> LogReason.TIMEOUT
        is InterruptedIOException -> LogReason.INTERRUPTED
        else -> LogReason.IO_ERROR
    }
