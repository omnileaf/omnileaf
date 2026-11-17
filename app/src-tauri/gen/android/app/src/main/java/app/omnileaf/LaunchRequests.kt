package app.omnileaf

import android.content.Intent

internal data class LaunchIntent(
    val iconAction: IconAction?,
    val handedDocument: String?,
    val isFromRecents: Boolean,
) {
    val isRequest: Boolean
        get() = iconAction != null || handedDocument != null
}

internal data class SavedScreen(
    val route: String?,
)

internal class LaunchRequests(
    private val iconActions: IconActionChoices,
) {
    private val handedDocuments = HandedDocuments()
    private val routeToRestore = RouteToRestore()

    /**
     * Android hands an activity it restores, or reopens from Recents, the intent that first started its task,
     * so only a fresh launch carries a new choice.
     */
    fun takeCreating(
        launching: LaunchIntent,
        saved: SavedScreen?,
    ) {
        iconActions.startNewPage()
        routeToRestore.load(saved?.route)
        if (saved == null && !launching.isFromRecents) take(launching)
    }

    fun take(launching: LaunchIntent) {
        if (launching.isRequest) routeToRestore.drop()
        launching.iconAction?.let(iconActions::choose)
        launching.handedDocument?.let(handedDocuments::receive)
    }

    fun takeRoute(): String? = routeToRestore.take()

    fun openingPageShown() {
        routeToRestore.openingPageShown()
    }

    fun routeToSave(shownPageUrl: String?): String? = routeToRestore.routeToSave(shownPageUrl)

    fun watchHandedDocuments(page: (String) -> Unit) {
        handedDocuments.watch(page)
    }
}

internal fun Intent.launchIntent(): LaunchIntent =
    LaunchIntent(
        iconAction = chosenIconAction(),
        handedDocument = handedDocument(),
        isFromRecents = (flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0,
    )
