package app.omnileaf

import app.tauri.plugin.JSObject
import org.json.JSONObject

internal fun statusReply(
    status: UpdateStatus,
    isAutomatic: Boolean,
): JSObject = JSObject().put("isAutomatic", isAutomatic).put("release", releaseReply(status))

internal fun checkReply(
    result: CheckResult?,
    status: JSObject,
): JSObject = JSObject().put("outcome", result?.let(::outcomeId) ?: JSONObject.NULL).put("status", status)

private fun releaseReply(status: UpdateStatus): JSObject =
    when (status) {
        UpdateStatus.Unchecked -> JSObject().put("kind", "unchecked")
        UpdateStatus.UpToDate -> JSObject().put("kind", "upToDate")
        is UpdateStatus.Newer -> newerReply(status.release, status.notice)
    }

private fun newerReply(
    release: PublishedRelease,
    notice: Notice,
): JSObject =
    JSObject()
        .put("kind", "newer")
        .put("version", release.version.toString())
        .put("headline", release.headline ?: JSONObject.NULL)
        .put("releasePage", releasePageAddress(release.version) ?: JSONObject.NULL)
        .put("notice", noticeId(notice))

private fun noticeId(notice: Notice): String =
    when (notice) {
        Notice.SHOWN -> "shown"
        Notice.SNOOZED -> "snoozed"
        Notice.SKIPPED -> "skipped"
    }

private fun outcomeId(result: CheckResult): String =
    when (result) {
        CheckResult.UpToDate -> "upToDate"
        is CheckResult.Available -> "available"
        CheckResult.Offline -> "offline"
        CheckResult.RateLimited -> "rateLimited"
        is CheckResult.Failed -> "failed"
    }
