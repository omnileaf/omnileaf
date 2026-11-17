package app.omnileaf

import java.time.Instant

internal class UpdateNoticeSwitch(
    private val state: UpdateState,
    private val background: BackgroundUpdateCheck,
    private val notices: UpdateNotices,
    private val installed: InstalledRelease,
) {
    val isOn: Boolean get() = state.notifies

    fun settle(turning: UpdateNoticeTurning): UpdateNoticeTurning {
        if (turning == UpdateNoticeTurning.TURNED_ON) {
            state.notifies = true
            background.sync(state)
        }
        return turning
    }

    fun turnOff() {
        state.notifies = false
        background.sync(state)
        notices.withdraw()
    }

    fun resync(now: Instant) {
        background.sync(state)
        val installedVersion = installed.version() ?: return
        state.withdrawStaleNotice(installedVersion, now, notices)
    }
}
