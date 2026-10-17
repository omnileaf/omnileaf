package app.omnileaf

import android.app.Activity
import android.content.Context
import android.content.Intent
import androidx.annotation.DrawableRes
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

private const val OPEN_ICON_ACTION = "app.omnileaf.OPEN_ICON_ACTION"
private const val CHOSEN_ACTION = "app.omnileaf.CHOSEN_ICON_ACTION"

enum class IconAction(val id: String, @get:DrawableRes val icon: Int) {
  SCREENSHOT_MODE("screenshotMode", R.drawable.shortcut_screenshot_mode),
  CONTINUE_READING("continueReading", R.drawable.shortcut_continue_reading),
  SEARCH_LIBRARY("searchLibrary", R.drawable.shortcut_search_library);

  companion object {
    fun withId(id: String?): IconAction? = entries.find { it.id == id }
  }
}

@InvokeArg
class IconShortcut {
  var action: String = ""
  var title: String = ""
  var titleWithState: String = ""
}

@InvokeArg
class ShownShortcuts {
  var shortcuts: Array<IconShortcut> = emptyArray()
}

@InvokeArg
class Watching {
  lateinit var channel: Channel
}

@TauriPlugin
class IconActionsPlugin(activity: Activity) : Plugin(activity) {
  private val context: Context = activity.applicationContext
  private var channel: Channel? = null
  private var pending: IconAction? = null

  init {
    take(activity.intent)
  }

  override fun onNewIntent(intent: Intent) {
    take(intent)
  }

  @Command
  fun show(invoke: Invoke) {
    val shown = invoke.parseArgs(ShownShortcuts::class.java)
    val shortcuts = shown.shortcuts.mapIndexedNotNull { rank, shortcut -> shortcut.info(context, rank) }
    if (!ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)) {
      return invoke.reject("Android is holding back changes to the app's shortcuts for now")
    }
    invoke.resolve()
  }

  @Command
  fun watch(invoke: Invoke) {
    watchWith(invoke.parseArgs(Watching::class.java).channel)
    invoke.resolve()
  }

  @Synchronized
  private fun watchWith(watching: Channel) {
    channel = watching
    pending?.let { watching.sendObject(it.id) }
    pending = null
  }

  @Synchronized
  private fun take(intent: Intent?) {
    if (intent?.action != OPEN_ICON_ACTION) return
    val chosen = IconAction.withId(intent.getStringExtra(CHOSEN_ACTION)) ?: return
    val watching = channel
    if (watching == null) {
      pending = chosen
    } else {
      watching.sendObject(chosen.id)
    }
  }
}

private fun IconShortcut.info(context: Context, rank: Int): ShortcutInfoCompat? {
  val chosen = IconAction.withId(action) ?: return null
  val opening = Intent(context, MainActivity::class.java)
    .setAction(OPEN_ICON_ACTION)
    .putExtra(CHOSEN_ACTION, chosen.id)
  return ShortcutInfoCompat.Builder(context, chosen.id)
    .setShortLabel(title)
    .setLongLabel(titleWithState)
    .setIcon(IconCompat.createWithResource(context, chosen.icon))
    .setIntent(opening)
    .setRank(rank)
    .build()
}
