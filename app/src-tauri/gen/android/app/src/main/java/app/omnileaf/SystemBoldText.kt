package app.omnileaf

import android.annotation.SuppressLint
import android.content.res.Configuration

/** Android 12 reports Bold text as a font weight adjustment, whose inlined undefined marker is only a number compared on older versions. */
@SuppressLint("InlinedApi")
internal fun isBoldText(fontWeightAdjustment: Int?): Boolean =
    fontWeightAdjustment != null &&
        fontWeightAdjustment != Configuration.FONT_WEIGHT_ADJUSTMENT_UNDEFINED &&
        fontWeightAdjustment > 0
