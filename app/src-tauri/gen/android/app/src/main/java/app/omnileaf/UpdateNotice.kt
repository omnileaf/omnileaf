package app.omnileaf

import java.time.Instant

internal interface PostedNotice {
    fun isShowing(version: ReleaseVersion): Boolean

    fun withdraw()
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
