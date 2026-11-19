package app.omnileaf

import android.app.NotificationManager
import java.time.Instant

internal interface PostedNotice {
    fun isShowing(version: ReleaseVersion): Boolean

    fun withdraw()
}

internal interface UpdateNotices : PostedNotice {
    fun canShow(): Boolean

    fun post(release: PublishedRelease)
}

internal sealed interface UpdateNotice {
    data class Post(
        val release: PublishedRelease,
    ) : UpdateNotice

    data object Keep : UpdateNotice

    data object Withdraw : UpdateNotice
}

internal fun UpdateState.noticeAfterCheck(
    installed: ReleaseVersion,
    now: Instant,
    posted: PostedNotice,
): UpdateNotice {
    val offered = offer(installed, now) ?: return UpdateNotice.Withdraw
    return if (posted.isShowing(offered.version)) UpdateNotice.Keep else UpdateNotice.Post(offered)
}

internal fun canShowNotices(
    areNotificationsEnabled: Boolean,
    channelImportance: Int,
): Boolean = areNotificationsEnabled && channelImportance != NotificationManager.IMPORTANCE_NONE

internal fun UpdateState.withdrawStaleNotice(
    installed: ReleaseVersion,
    now: Instant,
    posted: PostedNotice,
) {
    if (noticeAfterCheck(installed, now, posted) != UpdateNotice.Keep) posted.withdraw()
}
