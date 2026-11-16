package app.omnileaf

import android.app.Activity
import android.app.ActivityManager
import android.os.Build
import androidx.annotation.ColorInt

internal fun Activity.followRecentsChoice(choices: AppLockChoices) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        setRecentsScreenshotEnabled(!(choices.isOn && choices.hidesContentInRecents))
    }
}

/** Android draws the recent apps card and its bar strips from the task description, else from the theme's primary. */
internal fun Activity.colourRecentsCard(
    @ColorInt background: Int,
) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        setTaskDescription(
            ActivityManager.TaskDescription
                .Builder()
                .setPrimaryColor(background)
                .setBackgroundColor(background)
                .setStatusBarColor(background)
                .setNavigationBarColor(background)
                .build(),
        )
    } else {
        colourRecentsCardBeforeTiramisu(background)
    }
}

/** TaskDescription.Builder arrives in Android 13, so older versions take the deprecated constructor. */
@Suppress("DEPRECATION")
private fun Activity.colourRecentsCardBeforeTiramisu(
    @ColorInt background: Int,
) {
    setTaskDescription(ActivityManager.TaskDescription(null, null, background))
}
