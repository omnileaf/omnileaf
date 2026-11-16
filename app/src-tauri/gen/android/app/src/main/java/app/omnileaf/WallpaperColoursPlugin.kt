package app.omnileaf

import android.app.Activity
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class WallpaperColoursPlugin(
    private val activity: Activity,
) : Plugin(activity) {
    @Command
    fun read(invoke: Invoke) {
        val resources =
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.CINNAMON_BUN -> roleColours() + inverseRoleColours()
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> paletteTones() + roleColours()
                else -> paletteTones()
            }
        invoke.resolve(JSObject().put("colours", wallpaperScheme(resources, activity::getColor).toJson()))
    }
}

private fun WallpaperScheme.toJson(): JSObject =
    JSObject()
        .put("light", rolesJson { it.light })
        .put("dark", rolesJson { it.dark })

private fun WallpaperScheme.rolesJson(colourIn: (ThemedColour) -> Int): JSObject =
    roles.entries.fold(JSObject()) { json, (role, colour) -> json.put(role.id, colourIn(colour)) }
