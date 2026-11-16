package app.omnileaf

import android.app.Activity
import android.os.Build

internal fun Activity.followRecentsChoice(choices: AppLockChoices) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        setRecentsScreenshotEnabled(!(choices.isOn && choices.hidesContentInRecents))
    }
}
