package app.omnileaf

import android.util.Log

private const val LOG_TAG = "Omnileaf"

internal enum class LogLevel {
    WARNING,
    ERROR,
}

internal enum class LogEvent(
    val id: String,
) {
    SCREEN_LOCK_PROMPT_FAILED("screen_lock_prompt_failed"),
    UPDATE_CHECK_FAILED("update_check_failed"),
    UPDATE_CHECK_NOT_SCHEDULED("update_check_not_scheduled"),
}

internal enum class LogReason(
    val id: String,
) {
    HARDWARE_UNAVAILABLE("hardware_unavailable"),
    UNABLE_TO_PROCESS("unable_to_process"),
    TIMEOUT("timeout"),
    NO_SPACE("no_space"),
    CANCELED("canceled"),
    LOCKOUT("lockout"),
    LOCKOUT_PERMANENT("lockout_permanent"),
    VENDOR("vendor"),
    NO_BIOMETRICS("no_biometrics"),
    HARDWARE_NOT_PRESENT("hardware_not_present"),
    NO_DEVICE_CREDENTIAL("no_device_credential"),
    SECURITY_UPDATE_REQUIRED("security_update_required"),
    INTERRUPTED("interrupted"),
    IO_ERROR("io_error"),
    REFUSED("refused"),
    UNKNOWN("unknown"),
}

internal class PrivateLog(
    private val write: (LogLevel, String) -> Unit,
) {
    fun warn(
        event: LogEvent,
        reason: LogReason,
    ) = write(LogLevel.WARNING, line(event, reason))

    fun error(
        event: LogEvent,
        reason: LogReason,
    ) = write(LogLevel.ERROR, line(event, reason))
}

private fun line(
    event: LogEvent,
    reason: LogReason,
): String = "${event.id} reason=${reason.id}"

internal val APP_LOG =
    PrivateLog { level, line ->
        when (level) {
            LogLevel.WARNING -> Log.w(LOG_TAG, line)
            LogLevel.ERROR -> Log.e(LOG_TAG, line)
        }
    }
