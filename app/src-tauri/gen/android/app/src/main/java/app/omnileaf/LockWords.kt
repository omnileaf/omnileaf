package app.omnileaf

import android.content.Context
import app.tauri.annotation.InvokeArg

@InvokeArg
class HandedLockWords {
    lateinit var title: String
    lateinit var body: String
    lateinit var unlock: String
    lateinit var prompt: String
    lateinit var turnedOff: String
}

internal data class LockWords(
    val title: String,
    val body: String,
    val unlock: String,
    val prompt: String,
    val turnedOff: String,
) {
    val isComplete: Boolean
        get() = listOf(title, body, unlock, prompt, turnedOff).none { it.isBlank() }

    companion object {
        fun from(handed: HandedLockWords): LockWords =
            LockWords(
                title = handed.title,
                body = handed.body,
                unlock = handed.unlock,
                prompt = handed.prompt,
                turnedOff = handed.turnedOff,
            )

        fun builtIn(context: Context): LockWords =
            LockWords(
                title = context.getString(R.string.app_lock_locked_title),
                body = context.getString(R.string.app_lock_locked_body),
                unlock = context.getString(R.string.app_lock_unlock),
                prompt = context.getString(R.string.app_lock_unlock_prompt),
                turnedOff = context.getString(R.string.app_lock_turned_off_no_screen_lock),
            )
    }
}
