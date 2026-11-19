package app.omnileaf

internal class MemoryUpdateStore : UpdateStore {
    private val values = mutableMapOf<String, String>()

    override fun snapshot(): Map<String, String> = values.toMap()

    override fun write(values: Map<String, String?>) {
        values.forEach { (key, value) -> if (value == null) this.values.remove(key) else this.values[key] = value }
    }
}
