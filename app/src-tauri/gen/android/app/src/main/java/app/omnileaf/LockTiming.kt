package app.omnileaf

import kotlin.time.Duration

internal fun locksOnReturn(
    lockAfter: LockAfter,
    awayFor: Duration?,
): Boolean = awayFor == null || awayFor >= lockAfter.delay
