package app.omnileaf

import android.content.Context
import androidx.core.content.edit

private const val PREFERENCES = "update_check"

internal class PreferencesUpdateStore(
    context: Context,
) : UpdateStore {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    override fun snapshot(): Map<String, String> =
        preferences.all.mapNotNull { (key, value) -> (value as? String)?.let { key to it } }.toMap()

    override fun write(values: Map<String, String?>) {
        preferences.edit {
            values.forEach { (key, value) -> if (value == null) remove(key) else putString(key, value) }
        }
    }
}
