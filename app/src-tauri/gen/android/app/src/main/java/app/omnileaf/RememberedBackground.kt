package app.omnileaf

import android.app.Activity
import android.content.Context
import android.graphics.drawable.ColorDrawable
import androidx.annotation.ColorInt
import androidx.core.content.edit

private const val PREFERENCES = "page_background"
private const val COLOR_KEY = "color"

/** Keeps only a chosen light or dark page background, so under System the window still follows the device before the interface loads. */
class RememberedBackground(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  @ColorInt
  fun color(): Int? = if (preferences.contains(COLOR_KEY)) preferences.getInt(COLOR_KEY, 0) else null

  fun keep(background: PageBackground?) {
    preferences.edit {
      if (background == null) remove(COLOR_KEY) else putInt(COLOR_KEY, background.color())
    }
  }
}

fun Activity.showPageBackground(@ColorInt color: Int) {
  window.setBackgroundDrawable(ColorDrawable(color))
}
