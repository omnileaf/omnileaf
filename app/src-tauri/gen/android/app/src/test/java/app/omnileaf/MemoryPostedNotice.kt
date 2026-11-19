package app.omnileaf

internal class MemoryPostedNotice : PostedNotice {
    private var showing: ReleaseVersion? = null
    var withdrawals = 0
        private set

    fun post(release: PublishedRelease) {
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
