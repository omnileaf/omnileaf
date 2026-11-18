package app.omnileaf

internal enum class NotificationAccess(
    val id: String,
) {
    ALLOWED("allowed"),
    NOT_ASKED("notAsked"),
    NOT_ALLOWED("notAllowed"),
}

internal fun notificationAccess(
    canShow: Boolean,
    permission: NotificationPermission?,
    hasRefused: Boolean,
): NotificationAccess =
    when {
        canShow -> NotificationAccess.ALLOWED
        permission == NotificationPermission.NOT_ALLOWED && !hasRefused -> NotificationAccess.NOT_ASKED
        else -> NotificationAccess.NOT_ALLOWED
    }
