package app.omnileaf

internal class FakeReleaseFeed : ReleaseFeed {
    var reply = FeedReply(404, null, "")
    var requests = 0

    override fun fetchLatest(): FeedReply {
        requests += 1
        return reply
    }
}
