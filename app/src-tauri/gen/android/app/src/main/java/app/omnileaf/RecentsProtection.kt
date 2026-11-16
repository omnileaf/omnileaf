package app.omnileaf

import android.os.Build

internal enum class RecentsProtection {
    NONE,
    PLAIN_CARD,
    SECURE_WINDOW,
    ;

    companion object {
        /** Before Android 13 only the secure window flag hides the recents preview, and it also blocks screenshots. */
        fun of(
            isLockOn: Boolean,
            sdk: Int,
        ): RecentsProtection =
            when {
                !isLockOn -> NONE
                sdk >= Build.VERSION_CODES.TIRAMISU -> PLAIN_CARD
                else -> SECURE_WINDOW
            }
    }
}
