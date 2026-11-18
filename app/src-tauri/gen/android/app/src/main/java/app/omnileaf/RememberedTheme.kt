package app.omnileaf

import android.content.Context
import androidx.core.content.edit
import app.tauri.plugin.JSObject
import org.json.JSONObject

private const val PREFERENCES = "starting_theme"
private const val THEME_KEY = "theme"

internal fun storedStartingTheme(stored: String?): StartingTheme? = StartingTheme.entries.find { it.name == stored }

internal fun rememberedThemeReply(theme: StartingTheme?): JSObject = JSObject().put("theme", theme?.name ?: JSONObject.NULL)

class RememberedTheme(
    context: Context,
) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun stored(): StartingTheme? = storedStartingTheme(preferences.getString(THEME_KEY, null))

    fun theme(): StartingTheme = stored() ?: StartingTheme.DEVICE

    fun keep(theme: StartingTheme) {
        preferences.edit(commit = true) { putString(THEME_KEY, theme.name) }
    }
}
