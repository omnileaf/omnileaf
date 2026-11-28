package app.omnileaf

import android.view.KeyEvent

internal enum class PageTurn(
    val id: String,
) {
    PREVIOUS("previous"),
    NEXT("next"),
}

internal enum class Press(
    val id: String,
) {
    PRESSED("pressed"),
    HELD("held"),
}

internal data class VolumeKeyTurn(
    val turn: PageTurn,
    val press: Press,
) {
    val message: Map<String, String>
        get() = mapOf("turn" to turn.id, "press" to press.id)
}

internal fun interface PageTurns {
    fun turn(turn: VolumeKeyTurn)
}

internal data class KeyPress(
    val keyCode: Int,
    val action: Int,
    val repeatCount: Int,
)

internal fun KeyEvent.toKeyPress(): KeyPress = KeyPress(keyCode, action, repeatCount)

internal class VolumeKeyCapture {
    private var turns: PageTurns? = null

    fun capture(turns: PageTurns) {
        this.turns = turns
    }

    fun release() {
        turns = null
    }

    /**
     * Android changes the volume on a volume key's down event and repeats that down while the key is held,
     * so a captured key keeps every event from Android and turns a page on each down, saying when it repeats.
     */
    fun handle(press: KeyPress): Boolean {
        val turn = press.pageTurn ?: return false
        val capturing = turns ?: return false
        if (press.isDown) {
            capturing.turn(VolumeKeyTurn(turn, press.kind))
        }
        return true
    }
}

private val KeyPress.pageTurn: PageTurn?
    get() =
        when (keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> PageTurn.PREVIOUS
            KeyEvent.KEYCODE_VOLUME_DOWN -> PageTurn.NEXT
            else -> null
        }

private val KeyPress.kind: Press
    get() = if (repeatCount > 0) Press.HELD else Press.PRESSED

private val KeyPress.isDown: Boolean
    get() = action == KeyEvent.ACTION_DOWN
