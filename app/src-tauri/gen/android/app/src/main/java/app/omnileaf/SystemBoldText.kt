package app.omnileaf

import android.content.res.Configuration

/** Android marks an unknown font weight adjustment with `Int.MAX_VALUE`, which would otherwise read as bold. */
internal fun isBoldText(fontWeightAdjustment: Int): Boolean =
    fontWeightAdjustment != Configuration.FONT_WEIGHT_ADJUSTMENT_UNDEFINED && fontWeightAdjustment > 0

internal class BoldTextChanges(
    private val tell: (Boolean) -> Unit,
) {
    private var told: Boolean? = null

    fun follow(fontWeightAdjustment: Int) {
        val isBold = isBoldText(fontWeightAdjustment)
        if (isBold == told) return
        told = isBold
        tell(isBold)
    }
}
