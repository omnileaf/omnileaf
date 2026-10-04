package app.omnileaf

import android.content.Context
import androidx.core.content.edit

private const val PREFERENCES = "starting_theme"
private const val THEME_KEY = "theme"

class RememberedTheme(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun theme(): StartingTheme {
    val stored = preferences.getString(THEME_KEY, null)
    return StartingTheme.entries.find { it.name == stored } ?: StartingTheme.DEVICE
  }

  fun keep(theme: StartingTheme) {
    preferences.edit { putString(THEME_KEY, theme.name) }
  }
}
