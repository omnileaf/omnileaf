package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class UpdateNoticeTurningTest {
    private val store = MemoryUpdateStore()
    private val asking = UpdateNoticeAsking(UpdateState(store))

    private fun asks(
        before: NotificationPermission,
        answer: NotificationPermission,
        canShow: Boolean = false,
    ): UpdateNoticeTurning {
        asking.beforeAsking(before)
        return asking.afterAsking(answer, canShow)
    }

    @Test
    fun `turns on once Android allows notices that can be shown`() {
        assertEquals(
            UpdateNoticeTurning.TURNED_ON,
            asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.ALLOWED, canShow = true),
        )
    }

    @Test
    fun `is blocked when allowed but the updates channel is off`() {
        assertEquals(UpdateNoticeTurning.BLOCKED, asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.ALLOWED, canShow = false))
    }

    @Test
    fun `stays off and may ask again when the first prompt is backed out of or dismissed`() {
        assertEquals(UpdateNoticeTurning.REFUSED, asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.NOT_ALLOWED))
    }

    @Test
    fun `may still ask again after backing out of the prompt twice`() {
        val answers = List(2) { asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.NOT_ALLOWED) }

        assertEquals(List(2) { UpdateNoticeTurning.REFUSED }, answers)
    }

    @Test
    fun `stays off and may ask again after the prompt is refused once`() {
        assertEquals(UpdateNoticeTurning.REFUSED, asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.REFUSED_ONCE))
    }

    @Test
    fun `stays off and may ask again when the prompt is backed out of after a refusal`() {
        assertEquals(UpdateNoticeTurning.REFUSED, asks(NotificationPermission.REFUSED_ONCE, NotificationPermission.REFUSED_ONCE))
    }

    @Test
    fun `is blocked once the prompt is refused twice`() {
        asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.REFUSED_ONCE)

        assertEquals(UpdateNoticeTurning.BLOCKED, asks(NotificationPermission.REFUSED_ONCE, NotificationPermission.NOT_ALLOWED))
    }

    @Test
    fun `is blocked when Android stops asking after a refusal it no longer reports before the prompt`() {
        asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.REFUSED_ONCE)

        assertEquals(UpdateNoticeTurning.BLOCKED, asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.NOT_ALLOWED))
    }

    @Test
    fun `is blocked when Android stops asking after a refusal it reported before the prompt`() {
        assertEquals(UpdateNoticeTurning.BLOCKED, asks(NotificationPermission.REFUSED_ONCE, NotificationPermission.NOT_ALLOWED))
    }

    @Test
    fun `stays blocked on a later visit once Android has stopped asking`() {
        asks(NotificationPermission.NOT_ALLOWED, NotificationPermission.REFUSED_ONCE)
        asks(NotificationPermission.REFUSED_ONCE, NotificationPermission.NOT_ALLOWED)
        val later = UpdateNoticeAsking(UpdateState(store))

        later.beforeAsking(NotificationPermission.NOT_ALLOWED)

        assertEquals(UpdateNoticeTurning.BLOCKED, later.afterAsking(NotificationPermission.NOT_ALLOWED, canShow = false))
    }

    @Test
    fun `turns on without a prompt when Android has no notification permission to ask for`() {
        assertEquals(UpdateNoticeTurning.TURNED_ON, turningWithoutAsking(canShow = true))
    }

    @Test
    fun `is blocked without a prompt when notifications are off for the app`() {
        assertEquals(UpdateNoticeTurning.BLOCKED, turningWithoutAsking(canShow = false))
    }
}
