package app.omnileaf

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.time.Instant

class UpdateNoticeReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val choices = UpdateNoticeChoices(UpdateState(PreferencesUpdateStore(context)), UpdateNotifications(context))
        choices.answer(intent.action, intent.getStringExtra(EXTRA_UPDATE_VERSION), Instant.now())
    }
}
