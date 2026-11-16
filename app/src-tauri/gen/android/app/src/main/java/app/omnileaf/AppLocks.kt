package app.omnileaf

import android.os.SystemClock

internal object AppLocks {
    val state = LockState(SystemClock::elapsedRealtime)
}
