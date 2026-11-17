package app.omnileaf

import app.tauri.plugin.Channel

internal object ChosenIconActions : IconActionChoices {
    private var page: Channel? = null
    private var unseen: IconAction? = null

    @Synchronized
    override fun startNewPage() {
        page = null
    }

    @Synchronized
    override fun choose(chosen: IconAction) {
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
