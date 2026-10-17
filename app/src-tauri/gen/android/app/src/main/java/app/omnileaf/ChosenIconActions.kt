package app.omnileaf

import app.tauri.plugin.Channel

internal object ChosenIconActions {
  private var page: Channel? = null
  private var unseen: IconAction? = null

  @Synchronized
  fun startNewPage() {
    page = null
  }

  @Synchronized
  fun choose(chosen: IconAction) {
    val watching = page
    if (watching == null) {
      unseen = chosen
    } else {
      watching.sendObject(chosen.id)
    }
  }

  @Synchronized
  fun watch(watching: Channel) {
    page = watching
    unseen?.let { watching.sendObject(it.id) }
    unseen = null
  }
}
