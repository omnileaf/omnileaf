package app.omnileaf

import android.content.pm.ActivityInfo

private const val CHANGES_THE_COVER_DRAWS =
    ActivityInfo.CONFIG_FONT_SCALE or
        ActivityInfo.CONFIG_DENSITY or
        ActivityInfo.CONFIG_UI_MODE or
        ActivityInfo.CONFIG_LOCALE

internal fun changesWhatTheCoverDraws(configurationChanges: Int): Boolean = configurationChanges and CHANGES_THE_COVER_DRAWS != 0
