package app.omnileaf

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.WebView
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.time.Instant

private const val NOTIFICATIONS = "notifications"

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = NOTIFICATIONS)])
class UpdateNoticesPlugin(
    private val activity: Activity,
) : Plugin(activity) {
    private val context = activity.applicationContext
    private val notices = UpdateNotifications(context)
    private val words = RememberedNoticeWords(PreferencesUpdateStore(context))
    private val state = UpdateState(PreferencesUpdateStore(context))
    private val asking = UpdateNoticeAsking(state)
    private val switch =
        UpdateNoticeSwitch(
            state,
            BackgroundUpdateCheck(SystemUpdateCheckJobs(context)),
            notices,
            PackageInstalledRelease(context),
        )

    override fun load(webView: WebView) {
        switch.resync(Instant.now())
    }

    @Command
    fun read(invoke: Invoke) {
        invoke.resolve(JSObject().put("isOn", switch.isOn).put("canShow", notices.canShow()))
    }

    @Command
    fun turnOn(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            asking.beforeAsking(notificationPermission())
            requestPermissionForAlias(NOTIFICATIONS, invoke, ::notificationsAnswered.name)
        } else {
            resolve(invoke, turningWithoutAsking(notices.canShow()))
        }
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    @PermissionCallback
    fun notificationsAnswered(invoke: Invoke) {
        resolve(invoke, asking.afterAsking(notificationPermission(), notices.canShow()))
    }

    @Command
    fun turnOff(invoke: Invoke) {
        switch.turnOff()
        invoke.resolve()
    }

    @Command
    fun rememberWords(invoke: Invoke) {
        val handed = UpdateNoticeWords.from(invoke.parseArgs(HandedNoticeWords::class.java))
        if (!handed.isComplete) {
            return invoke.reject("the update notice needs all of its words and a place for the version")
        }
        words.remember(handed)
        invoke.resolve()
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun notificationPermission(): NotificationPermission {
        val permission = Manifest.permission.POST_NOTIFICATIONS
        return when {
            ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED -> NotificationPermission.ALLOWED
            ActivityCompat.shouldShowRequestPermissionRationale(activity, permission) -> NotificationPermission.REFUSED_ONCE
            else -> NotificationPermission.NOT_ALLOWED
        }
    }

    private fun resolve(
        invoke: Invoke,
        turning: UpdateNoticeTurning,
    ) {
        invoke.resolve(JSObject().put("turning", switch.settle(turning).id))
    }
}
