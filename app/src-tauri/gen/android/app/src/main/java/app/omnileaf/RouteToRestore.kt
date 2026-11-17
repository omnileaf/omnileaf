package app.omnileaf

internal class RouteToRestore {
    private var route: String? = null

    @Synchronized
    fun load(saved: String?) {
        route = saved
    }

    @Synchronized
    fun take(): String? = route.also { route = null }

    @Synchronized
    fun drop() {
        route = null
    }

    @Synchronized
    fun routeToSave(shownPageUrl: String?): String? = route ?: shownPageUrl?.let(::appRouteOf)
}
