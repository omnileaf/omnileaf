package app.omnileaf

internal class RouteToRestore(
    private var route: String?,
) {
    @Synchronized
    fun take(): String? = route.also { route = null }

    @Synchronized
    fun drop() {
        route = null
    }

    @Synchronized
    fun routeToSave(shownPageUrl: String?): String? = route ?: shownPageUrl?.let(::appRouteOf)
}
