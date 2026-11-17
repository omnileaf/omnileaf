package app.omnileaf

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.core.net.toUri

private const val CHANNEL_ID = "updates"
private const val NOTICE_ID = 7101
private const val PENDING_FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

internal class UpdateNotifications(
    private val context: Context,
) : UpdateNotices {
    private val manager: NotificationManager =
        requireNotNull(context.getSystemService(NotificationManager::class.java)) { "look up the NotificationManager system service" }
    private val rememberedWords = RememberedNoticeWords(PreferencesUpdateStore(context))
    private val shownWords: UpdateNoticeWords
        get() = rememberedWords.toShow { UpdateNoticeWords.builtIn(context) }

    override fun canShow(): Boolean = canShowNotices(manager.areNotificationsEnabled(), createdChannel(shownWords).importance)

    override fun isShowing(version: ReleaseVersion): Boolean =
        manager.activeNotifications.any {
            it.id == NOTICE_ID && it.notification.extras.getString(EXTRA_UPDATE_VERSION) == version.toString()
        }

    override fun withdraw() = manager.cancel(NOTICE_ID)

    override fun post(release: PublishedRelease) {
        val shown = shownWords
        createdChannel(shown)
        manager.notify(NOTICE_ID, notice(release, shown))
    }

    private fun createdChannel(shown: UpdateNoticeWords): NotificationChannel {
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, shown.channel, NotificationManager.IMPORTANCE_DEFAULT))
        return requireNotNull(manager.getNotificationChannel(CHANNEL_ID)) { "read the $CHANNEL_ID notification channel just created" }
    }

    private fun notice(
        release: PublishedRelease,
        shown: UpdateNoticeWords,
    ): Notification {
        val version = release.version.toString()
        return Notification
            .Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_update)
            .setContentTitle(shown.titleFor(release.version))
            .setContentText(release.headline)
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .setDeleteIntent(answer(UpdateNoticeAction.SNOOZE, version))
            .addExtras(Bundle().apply { putString(EXTRA_UPDATE_VERSION, version) })
            .addAction(action(shown.viewRelease, viewRelease(release.version)))
            .addAction(action(shown.skip, answer(UpdateNoticeAction.SKIP, version)))
            .build()
    }

    private fun action(
        label: String,
        intent: PendingIntent,
    ): Notification.Action = Notification.Action.Builder(null, label, intent).build()

    private fun openApp(): PendingIntent {
        val launch =
            requireNotNull(context.packageManager.getLaunchIntentForPackage(context.packageName)) { "find the launch activity" }
        return PendingIntent.getActivity(context, 0, launch, PENDING_FLAGS)
    }

    private fun viewRelease(version: ReleaseVersion): PendingIntent {
        val page = Intent(Intent.ACTION_VIEW, "https://github.com/$OMNILEAF_REPOSITORY/releases/tag/${version.tag}".toUri())
        return PendingIntent.getActivity(context, 0, page, PENDING_FLAGS)
    }

    private fun answer(
        action: UpdateNoticeAction,
        version: String,
    ): PendingIntent {
        val intent =
            Intent(context, UpdateNoticeReceiver::class.java)
                .setAction(action.intentAction)
                .putExtra(EXTRA_UPDATE_VERSION, version)
        return PendingIntent.getBroadcast(context, 0, intent, PENDING_FLAGS)
    }
}
