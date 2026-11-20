package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationAccessTest {
    @Test
    fun `is allowed whenever android shows the app's notices`() {
        val access = notificationAccess(canShow = true, permission = NotificationPermission.NOT_ALLOWED, hasRefused = true)

        assertEquals(NotificationAccess.ALLOWED, access)
    }

    @Test
    fun `is not asked before android 13 has asked for the permission`() {
        val access = notificationAccess(canShow = false, permission = NotificationPermission.NOT_ALLOWED, hasRefused = false)

        assertEquals(NotificationAccess.NOT_ASKED, access)
    }

    @Test
    fun `is not allowed after a no or with notices turned off in android's settings`() {
        val cases =
            listOf(
                Triple(NotificationPermission.REFUSED_ONCE, false, "refused once"),
                Triple(NotificationPermission.NOT_ALLOWED, true, "no longer asked"),
                Triple(NotificationPermission.ALLOWED, false, "granted, but the app's notices are off"),
            )

        val accesses = cases.map { (permission, hasRefused, _) -> notificationAccess(false, permission, hasRefused) }

        assertEquals(List(cases.size) { NotificationAccess.NOT_ALLOWED }, accesses)
    }

    @Test
    fun `is not allowed below android 13 once the app's notices are off`() {
        val access = notificationAccess(canShow = false, permission = null, hasRefused = false)

        assertEquals(NotificationAccess.NOT_ALLOWED, access)
    }
}
