package app.omnileaf

import android.app.Activity
import android.app.ActivityManager
import android.os.Build
import android.view.WindowManager
import androidx.annotation.ColorInt

internal fun Activity.protectRecents(isLockOn: Boolean) {
    when (RecentsProtection.of(isLockOn, Build.VERSION.SDK_INT)) {
        RecentsProtection.NONE -> {
            showRecentsScreenshot(true)
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }

        RecentsProtection.PLAIN_CARD -> {
            showRecentsScreenshot(false)
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }

        RecentsProtection.SECURE_WINDOW -> {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}

private fun Activity.showRecentsScreenshot(isShown: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        setRecentsScreenshotEnabled(isShown)
    }
}

/** Android draws the recent apps card and its bar strips from the task description, else from the theme. */
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
