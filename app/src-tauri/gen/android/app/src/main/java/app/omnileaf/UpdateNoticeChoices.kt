package app.omnileaf

import java.time.Instant

internal class UpdateNoticeChoices(
    private val state: UpdateState,
    private val posted: PostedNotice,
) {
    fun skip(version: ReleaseVersion) {
        state.skip(version)
        withdrawIfShowing(version)
    }

    fun snooze(
        version: ReleaseVersion,
        now: Instant,
    ) {
        state.snooze(version, now)
        withdrawIfShowing(version)
    }

    private fun withdrawIfShowing(version: ReleaseVersion) {
        if (posted.isShowing(version)) posted.withdraw()
    }
}
