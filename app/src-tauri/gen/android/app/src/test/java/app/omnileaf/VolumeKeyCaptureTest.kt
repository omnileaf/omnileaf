package app.omnileaf

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private fun pressed(keyCode: Int, repeatCount: Int = 0) = KeyPress(keyCode, KeyEvent.ACTION_DOWN, repeatCount)

private fun lifted(keyCode: Int) = KeyPress(keyCode, KeyEvent.ACTION_UP, 0)

class VolumeKeyCaptureTest {
  private val turns = mutableListOf<PageTurn>()

  private fun captured(): VolumeKeyCapture = VolumeKeyCapture().apply { capture { turns.add(it) } }

  @Test
  fun `turns to the next page on volume down while captured`() {
    val capture = captured()

    val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_DOWN))

    assertTrue(isKept)
    assertEquals(listOf(PageTurn.NEXT), turns)
  }

  @Test
  fun `turns to the previous page on volume up while captured`() {
    val capture = captured()

    val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_UP))

    assertTrue(isKept)
    assertEquals(listOf(PageTurn.PREVIOUS), turns)
  }

  @Test
  fun `leaves the volume keys to Android until captured`() {
    val capture = VolumeKeyCapture()

    val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_DOWN))

    assertFalse(isKept)
    assertEquals(emptyList<PageTurn>(), turns)
  }

  @Test
  fun `leaves the volume keys to Android once released`() {
    val capture = captured()
    capture.release()

    val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_UP))

    assertFalse(isKept)
    assertEquals(emptyList<PageTurn>(), turns)
  }

  @Test
  fun `keeps a held key from Android without turning again`() {
    val capture = captured()

    val isKept = capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_DOWN, repeatCount = 1))

    assertTrue(isKept)
    assertEquals(emptyList<PageTurn>(), turns)
  }

  @Test
  fun `keeps a lifted key from Android without turning`() {
    val capture = captured()

    val isKept = capture.handle(lifted(KeyEvent.KEYCODE_VOLUME_DOWN))

    assertTrue(isKept)
    assertEquals(emptyList<PageTurn>(), turns)
  }

  @Test
  fun `leaves the other keys to Android while captured`() {
    val capture = captured()

    val isKept = capture.handle(pressed(KeyEvent.KEYCODE_BACK))

    assertFalse(isKept)
    assertEquals(emptyList<PageTurn>(), turns)
  }

  @Test
  fun `turns pages for the latest capture only`() {
    val earlier = mutableListOf<PageTurn>()
    val capture = VolumeKeyCapture().apply { capture { earlier.add(it) } }
    capture.capture { turns.add(it) }

    capture.handle(pressed(KeyEvent.KEYCODE_VOLUME_DOWN))

    assertEquals(emptyList<PageTurn>(), earlier)
    assertEquals(listOf(PageTurn.NEXT), turns)
  }
}
