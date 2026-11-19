package app.omnileaf

import java.time.Instant

internal const val EXTRA_UPDATE_VERSION = "app.omnileaf.extra.UPDATE_VERSION"

internal enum class UpdateNoticeAction(
    val intentAction: String,
) {
    SKIP("app.omnileaf.action.SKIP_UPDATE"),
    SNOOZE("app.omnileaf.action.SNOOZE_UPDATE"),
}

internal fun UpdateNoticeChoices.answer(
    intentAction: String?,
    version: String?,
    now: Instant,
) {
    val chosen = UpdateNoticeAction.entries.find { it.intentAction == intentAction } ?: return
    val named = version?.let(ReleaseVersion::parse) ?: return
    when (chosen) {
        UpdateNoticeAction.SKIP -> skip(named)
        UpdateNoticeAction.SNOOZE -> snooze(named, now)
    }
}
