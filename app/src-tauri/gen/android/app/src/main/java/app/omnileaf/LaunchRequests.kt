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
    private val chooseIconAction: (IconAction) -> Unit,
) {
    val handedDocuments = HandedDocuments()
    val routeToRestore = RouteToRestore()

    /**
     * Android hands an activity it restores, or reopens from Recents, the intent that first started its task,
     * so only a fresh launch carries a new choice.
     */
    fun takeCreating(
        launching: LaunchIntent,
        saved: SavedScreen?,
    ) {
        routeToRestore.load(saved?.route)
        if (saved == null && !launching.isFromRecents) take(launching)
    }

    fun take(launching: LaunchIntent) {
        if (launching.isRequest) routeToRestore.drop()
        launching.iconAction?.let(chooseIconAction)
        launching.handedDocument?.let(handedDocuments::receive)
    }
}

internal fun Intent.launchIntent(): LaunchIntent =
    LaunchIntent(
        iconAction = chosenIconAction(),
        handedDocument = handedDocument(),
        isFromRecents = (flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0,
    )
