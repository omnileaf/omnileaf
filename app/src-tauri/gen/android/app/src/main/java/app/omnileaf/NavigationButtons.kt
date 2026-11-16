package app.omnileaf

import android.app.Activity
import android.os.Build

internal fun Activity.showTheAppBehindTheNavigationButtons() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        window.isNavigationBarContrastEnforced = false
    }
}
