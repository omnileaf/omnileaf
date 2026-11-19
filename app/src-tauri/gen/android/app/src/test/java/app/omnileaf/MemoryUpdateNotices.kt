package app.omnileaf

internal class MemoryUpdateNotices : UpdateNotices {
    private var showing: ReleaseVersion? = null
    var withdrawals = 0
        private set
    var isAllowed = true

    override fun canShow(): Boolean = isAllowed

    override fun post(release: PublishedRelease) {
        showing = release.version
    }

    fun clearAll() {
        showing = null
    }

    override fun isShowing(version: ReleaseVersion): Boolean = showing == version

    override fun withdraw() {
        showing = null
        withdrawals += 1
    }
}
