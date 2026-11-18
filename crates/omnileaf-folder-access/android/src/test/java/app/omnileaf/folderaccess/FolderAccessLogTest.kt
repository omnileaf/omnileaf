package app.omnileaf.folderaccess

import org.junit.Assert.assertEquals
import org.junit.Test
import java.lang.reflect.Modifier

class FolderAccessLogTest {
    @Test
    fun `writes a warning as its event and reason, nothing else`() {
        val written = mutableListOf<String>()

        FolderAccessLog { written += it }.warn(FolderAccessEvent.DOCUMENT_LISTED_INCOMPLETE, FolderAccessReason.MISSING_NAME)

        assertEquals(listOf("document_listed_incomplete reason=missing_name"), written)
    }

    @Test
    fun `takes only fixed events and reasons, so no free text can reach the log`() {
        val parameterTypes =
            FolderAccessLog::class.java.declaredMethods
                .filter { Modifier.isPublic(it.modifiers) }
                .flatMap { it.parameterTypes.toList() }
                .toSet()

        assertEquals(setOf(FolderAccessEvent::class.java, FolderAccessReason::class.java), parameterTypes)
    }

    @Test
    fun `names what a listed document lacks`() {
        val reasons =
            listOf(true to true, false to true, true to false, false to false)
                .map { (hasId, hasName) -> incompleteListing(hasId, hasName) }

        assertEquals(
            listOf(null, FolderAccessReason.MISSING_ID, FolderAccessReason.MISSING_NAME, FolderAccessReason.MISSING_ID_AND_NAME),
            reasons,
        )
    }
}
