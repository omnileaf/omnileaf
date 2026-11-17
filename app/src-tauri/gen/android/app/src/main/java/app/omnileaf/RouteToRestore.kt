package app.omnileaf

internal class RouteToRestore {
    private var route: String? = null
    private var handedOver: String? = null

    @Synchronized
    fun load(saved: String?) {
        route = saved
        handedOver = null
    }

    @Synchronized
    fun take(): String? {
        val taken = route ?: return null
        route = null
        handedOver = taken
        return taken
    }

    @Synchronized
    fun shown() {
        handedOver = null
    }

    @Synchronized
    fun drop() {
        route = null
        handedOver = null
    }

    @Synchronized
    fun routeToSave(shownPageUrl: String?): String? = route ?: handedOver ?: shownPageUrl?.let(::appRouteOf)
}
