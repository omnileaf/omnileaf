package app.omnileaf

internal class InMemoryUpdateStore : UpdateStore {
    private val values = mutableMapOf<String, String>()

    override fun snapshot(): Map<String, String> = values.toMap()

    override fun write(values: Map<String, String?>) {
        values.forEach { (key, value) -> if (value == null) this.values.remove(key) else this.values[key] = value }
    }
}

internal class FakeReleaseFeed : ReleaseFeed {
    var reply = FeedReply(404, null, "")
    var requests = 0

    override fun fetchLatest(): FeedReply {
        requests += 1
        return reply
    }
}
