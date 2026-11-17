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
    fun toSave(pageUrl: String?): String? = route ?: pageUrl?.let(::appRouteOf)
}
