package app.omnileaf

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private fun pressed(keyCode: Int) = KeyPress(keyCode, KeyEvent.ACTION_DOWN, repeatCount = 0)

private fun repeated(keyCode: Int) = KeyPress(keyCode, KeyEvent.ACTION_DOWN, repeatCount = 1)

private fun lifted(keyCode: Int) = KeyPress(keyCode, KeyEvent.ACTION_UP, repeatCount = 0)

private fun next(press: Press = Press.PRESSED) = VolumeKeyTurn(PageTurn.NEXT, press)

private fun previous(press: Press = Press.PRESSED) = VolumeKeyTurn(PageTurn.PREVIOUS, press)

class VolumeKeyCaptureTest {
    private val turns = mutableListOf<VolumeKeyTurn>()

    private fun captured(): VolumeKeyCapture = VolumeKeyCapture().apply { capture { turns.add(it) } }

    @Test
    fun `turns to the next page on volume down while captured`() {
        val capture = captured()

        val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_DOWN))

        assertTrue(isKept)
        assertEquals(listOf(next()), turns)
    }

    @Test
    fun `turns to the previous page on volume up while captured`() {
        val capture = captured()

        val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_UP))

        assertTrue(isKept)
        assertEquals(listOf(previous()), turns)
    }

    @Test
    fun `leaves the volume keys to Android until captured`() {
        val capture = VolumeKeyCapture()

        val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_DOWN))

        assertFalse(isKept)
        assertEquals(emptyList<VolumeKeyTurn>(), turns)
    }

    @Test
    fun `leaves the volume keys to Android once released`() {
        val capture = captured()
        capture.release()

        val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_UP))

        assertFalse(isKept)
        assertEquals(emptyList<VolumeKeyTurn>(), turns)
    }

    @Test
    fun `turns again with each repeat of a held key, saying it is held`() {
        val capture = captured()

        capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_DOWN))
        val isKept = capture.handle(repeated(KeyEvent.KEYCODE_VOLUME_DOWN))

        assertTrue(isKept)
        assertEquals(listOf(next(), next(Press.HELD)), turns)
    }

    @Test
    fun `keeps a lifted key from Android without turning`() {
        val capture = captured()

        val isKept = capture.handle(lifted(KeyEvent.KEYCODE_VOLUME_DOWN))

        assertTrue(isKept)
        assertEquals(emptyList<VolumeKeyTurn>(), turns)
    }

    @Test
    fun `leaves the other keys to Android while captured`() {
        val capture = captured()

        val isKept = capture.handle(pressed(KeyEvent.KEYCODE_BACK))

        assertFalse(isKept)
        assertEquals(emptyList<VolumeKeyTurn>(), turns)
    }

    @Test
    fun `turns pages for the latest capture only`() {
        val earlier = mutableListOf<VolumeKeyTurn>()
        val capture = VolumeKeyCapture().apply { capture { earlier.add(it) } }
        capture.capture { turns.add(it) }

        capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_DOWN))

        assertEquals(emptyList<VolumeKeyTurn>(), earlier)
        assertEquals(listOf(next()), turns)
    }

    @Test
    fun `sends a held turn in the words the interface reads`() {
        val message = next(Press.HELD).message

        assertEquals(mapOf("turn" to "next", "press" to "held"), message)
    }
}
