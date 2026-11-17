package app.omnileaf

import java.net.URI
import java.net.URISyntaxException

/** Wry serves the app's pages on Android from http://tauri.localhost, standing in for the tauri:// scheme Android's WebView cannot load. */
private const val APP_SCHEME = "http"
private const val APP_HOST = "tauri.localhost"
private const val NO_PORT = -1
private const val ROOT = "/"

internal fun appRouteOf(pageUrl: String): String? {
    val page = parsedUri(pageUrl) ?: return null
    if (!page.isAppOrigin()) return null
    val path = page.rawPath.ifEmpty { ROOT }
    if (!path.startsWith(ROOT) || path.startsWith("$ROOT$ROOT")) return null
    return page.rawQuery?.let { query -> "$path?$query" } ?: path
}

private fun parsedUri(text: String): URI? =
    try {
        URI(text)
    } catch (_: URISyntaxException) {
        null
    }

private fun URI.isAppOrigin(): Boolean = scheme == APP_SCHEME && host == APP_HOST && port == NO_PORT
