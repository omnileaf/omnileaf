package app.omnileaf

import android.content.res.Configuration
import android.webkit.WebView

private const val PERCENT = 100

internal fun textZoomFor(fontScale: Float): Int = (fontScale * PERCENT).toInt()

/** Android's web view takes the font scale as its text zoom only when it is created. */
internal fun WebView.followFontScale(configuration: Configuration) {
    settings.textZoom = textZoomFor(configuration.fontScale)
}
