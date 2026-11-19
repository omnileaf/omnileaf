package app.omnileaf

import android.content.Context
import app.tauri.annotation.InvokeArg

internal const val VERSION_PLACEHOLDER = "{version}"

@InvokeArg
class HandedNoticeWords {
    lateinit var channel: String
    lateinit var title: String
    lateinit var viewRelease: String
    lateinit var skip: String
}

internal data class UpdateNoticeWords(
    val channel: String,
    val title: String,
    val viewRelease: String,
    val skip: String,
) {
    val isComplete: Boolean
        get() = listOf(channel, title, viewRelease, skip).none { it.isBlank() } && VERSION_PLACEHOLDER in title

    fun titleFor(version: ReleaseVersion): String = title.replace(VERSION_PLACEHOLDER, version.toString())

    companion object {
        fun from(handed: HandedNoticeWords): UpdateNoticeWords =
            UpdateNoticeWords(
                channel = handed.channel,
                title = handed.title,
                viewRelease = handed.viewRelease,
                skip = handed.skip,
            )

        fun builtIn(context: Context): UpdateNoticeWords =
            UpdateNoticeWords(
                channel = context.getString(R.string.update_notice_channel),
                title = context.getString(R.string.update_notice_title, VERSION_PLACEHOLDER),
                viewRelease = context.getString(R.string.update_notice_view_release),
                skip = context.getString(R.string.update_notice_skip),
            )
    }
}
