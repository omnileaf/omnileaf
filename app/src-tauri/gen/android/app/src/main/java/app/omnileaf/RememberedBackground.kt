package app.omnileaf

import android.app.Activity
import android.content.Context
import android.graphics.drawable.ColorDrawable
import androidx.annotation.ColorInt
import androidx.core.content.edit

private const val PREFERENCES = "page_background"
private const val COLOR_KEY = "color"

/** Keeps the interface's page background, so the window shows it before the interface loads and while it reloads. */
class RememberedBackground(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  @ColorInt
  fun color(): Int? = if (preferences.contains(COLOR_KEY)) preferences.getInt(COLOR_KEY, 0) else null

  fun remember(@ColorInt color: Int) {
    preferences.edit { putInt(COLOR_KEY, color) }
  }
}

fun Activity.showPageBackground(@ColorInt color: Int) {
  window.setBackgroundDrawable(ColorDrawable(color))
}
