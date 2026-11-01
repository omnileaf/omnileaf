package app.omnileaf

internal class HandedDocuments {
    private var page: ((String) -> Unit)? = null
    private var unseen: String? = null

    @Synchronized
    fun receive(uri: String) {
        val watching = page
        if (watching == null) {
            unseen = uri
        } else {
            watching(uri)
        }
    }

    @Synchronized
    fun watch(page: (String) -> Unit) {
        this.page = page
        unseen?.let(page)
        unseen = null
    }
}
