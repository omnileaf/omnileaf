package app.omnileaf

import android.content.Intent

private val OWN_SCREENS =
    setOf(
        Intent.ACTION_OPEN_DOCUMENT_TREE,
        Intent.ACTION_OPEN_DOCUMENT,
        Intent.ACTION_CREATE_DOCUMENT,
        Intent.ACTION_GET_CONTENT,
        Intent.ACTION_SEND,
        Intent.ACTION_SEND_MULTIPLE,
        Intent.ACTION_CHOOSER,
    )

internal fun isOwnScreen(action: String?): Boolean = action in OWN_SCREENS
