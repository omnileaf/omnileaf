package app.omnileaf

import java.time.Instant

internal class NotifyingUpdateCheck(
    private val state: UpdateState,
    private val installed: InstalledRelease,
    private val notices: UpdateNotices,
    feedFor: (ReleaseVersion) -> ReleaseFeed = { GitHubReleaseFeed(it) },
) {
    private val daily = DailyUpdateCheck(state, installed, feedFor)

    fun run(now: Instant) {
        if (!notices.canShow()) return
        daily.runIfDue(now)
        val installedVersion = installed.version() ?: return
        when (val notice = state.noticeAfterCheck(installedVersion, now, notices)) {
            is UpdateNotice.Post -> notices.post(notice.release)
            UpdateNotice.Keep -> Unit
            UpdateNotice.Withdraw -> notices.withdraw()
        }
    }
}
