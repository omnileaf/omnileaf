package app.omnileaf

import org.json.JSONObject
import org.junit.Assert.assertEquals

internal fun JSONObject.fields(): Map<String, Any?> =
    keys().asSequence().associateWith { key -> get(key).let { if (it is JSONObject) it.fields() else it } }

internal fun assertJson(
    expected: String,
    actual: JSONObject,
) = assertEquals(JSONObject(expected).fields(), actual.fields())
