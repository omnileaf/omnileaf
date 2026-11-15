package app.omnileaf

import android.content.Context
import app.tauri.annotation.InvokeArg
import org.json.JSONObject

@InvokeArg
class HandedLockWords {
    lateinit var title: String
    lateinit var body: String
    lateinit var unlock: String
    lateinit var prompt: String
    lateinit var noScreenLock: String
    lateinit var noScreenLockBody: String
}

internal data class LockWords(
    val title: String,
    val body: String,
    val unlock: String,
    val prompt: String,
    val noScreenLock: String,
    val noScreenLockBody: String,
) {
    val isComplete: Boolean
        get() = listOf(title, body, unlock, prompt, noScreenLock, noScreenLockBody).none { it.isBlank() }

    fun toJson(): String =
        JSONObject()
            .put(TITLE, title)
            .put(BODY, body)
            .put(UNLOCK, unlock)
            .put(PROMPT, prompt)
            .put(NO_SCREEN_LOCK, noScreenLock)
            .put(NO_SCREEN_LOCK_BODY, noScreenLockBody)
            .toString()

    companion object {
        private const val TITLE = "title"
        private const val BODY = "body"
        private const val UNLOCK = "unlock"
        private const val PROMPT = "prompt"
        private const val NO_SCREEN_LOCK = "noScreenLock"
        private const val NO_SCREEN_LOCK_BODY = "noScreenLockBody"

        fun fromJson(stored: String): LockWords {
            val words = JSONObject(stored)
            return LockWords(
                title = words.getString(TITLE),
                body = words.getString(BODY),
                unlock = words.getString(UNLOCK),
                prompt = words.getString(PROMPT),
                noScreenLock = words.getString(NO_SCREEN_LOCK),
                noScreenLockBody = words.getString(NO_SCREEN_LOCK_BODY),
            )
        }

        fun from(handed: HandedLockWords): LockWords =
            LockWords(
                title = handed.title,
                body = handed.body,
                unlock = handed.unlock,
                prompt = handed.prompt,
                noScreenLock = handed.noScreenLock,
                noScreenLockBody = handed.noScreenLockBody,
            )

        fun builtIn(context: Context): LockWords =
            LockWords(
                title = context.getString(R.string.app_lock_locked_title),
                body = context.getString(R.string.app_lock_locked_body),
                unlock = context.getString(R.string.app_lock_unlock),
                prompt = context.getString(R.string.app_lock_unlock_prompt),
                noScreenLock = context.getString(R.string.app_lock_no_screen_lock),
                noScreenLockBody = context.getString(R.string.app_lock_no_screen_lock_body),
            )
    }
}
