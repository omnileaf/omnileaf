package app.omnileaf

internal enum class UpdateNoticeTurning(
    val id: String,
) {
    TURNED_ON("turnedOn"),
    REFUSED("refused"),
    BLOCKED("blocked"),
}

internal enum class NotificationPermission {
    ALLOWED,
    REFUSED_ONCE,

    /** Android gives no rationale both before any refusal, so after a backed-out first prompt, and once it has stopped asking. */
    NOT_ALLOWED,
}

internal class UpdateNoticeAsking(
    private val state: UpdateState,
) {
    fun beforeAsking(permission: NotificationPermission) {
        if (permission == NotificationPermission.REFUSED_ONCE) {
            state.rememberNoticesRefused()
        }
    }

    fun afterAsking(
        answer: NotificationPermission,
        canShow: Boolean,
    ): UpdateNoticeTurning {
        beforeAsking(answer)
        return when (answer) {
            NotificationPermission.ALLOWED -> turningWithoutAsking(canShow)
            NotificationPermission.REFUSED_ONCE -> UpdateNoticeTurning.REFUSED
            NotificationPermission.NOT_ALLOWED -> if (state.hasRefusedNotices) UpdateNoticeTurning.BLOCKED else UpdateNoticeTurning.REFUSED
        }
    }
}

internal fun turningWithoutAsking(canShow: Boolean): UpdateNoticeTurning =
    if (canShow) UpdateNoticeTurning.TURNED_ON else UpdateNoticeTurning.BLOCKED
