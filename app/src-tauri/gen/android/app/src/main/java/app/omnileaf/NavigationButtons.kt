package app.omnileaf

import android.app.Activity

internal fun Activity.showTheAppBehindTheNavigationButtons() {
    window.isNavigationBarContrastEnforced = false
}
