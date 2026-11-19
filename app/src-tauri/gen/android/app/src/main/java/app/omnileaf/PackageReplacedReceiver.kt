package app.omnileaf

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.time.Instant

class PackageReplacedReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val installed = PackageInstalledRelease(context).version() ?: return
        UpdateState(PreferencesUpdateStore(context)).withdrawStaleNotice(installed, Instant.now(), UpdateNotifications(context))
    }
}
