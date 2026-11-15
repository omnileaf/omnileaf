package app.omnileaf

import android.content.Context
import android.os.Build
import androidx.core.content.edit
import app.tauri.Logger
import org.json.JSONObject

private const val PREFERENCES = "app_lock"
private const val IS_ON_KEY = "is_on"
private const val LOCK_AFTER_KEY = "lock_after"
private const val HIDES_CONTENT_IN_RECENTS_KEY = "hides_content_in_recents"
private const val WORDS_KEY = "words"

internal class AppLockChoices(
    private val context: Context,
) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    val isOn: Boolean
        get() = preferences.getBoolean(IS_ON_KEY, false)

    val lockAfter: LockAfter
        get() = LockAfter.of(preferences.getString(LOCK_AFTER_KEY, null))

    val hidesContentInRecents: Boolean
        get() = canHideContentInRecents && preferences.getBoolean(HIDES_CONTENT_IN_RECENTS_KEY, false)

    /** Android 13 added hiding only the recent apps preview; the older secure window flag also blocks screenshots. */
    val canHideContentInRecents: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    fun turn(isOn: Boolean) {
        preferences.edit { putBoolean(IS_ON_KEY, isOn) }
    }

    fun chooseLockAfter(lockAfter: LockAfter) {
        preferences.edit { putString(LOCK_AFTER_KEY, lockAfter.id) }
    }

    fun hideContentInRecents(isHidden: Boolean) {
        preferences.edit { putBoolean(HIDES_CONTENT_IN_RECENTS_KEY, isHidden) }
    }

    val wordsToShow: LockWords
        get() = storedWords()?.takeIf { it.isComplete } ?: LockWords.builtIn(context)

    fun remember(words: LockWords) {
        val stored =
            JSONObject()
                .put("title", words.title)
                .put("body", words.body)
                .put("unlock", words.unlock)
                .put("prompt", words.prompt)
                .put("noScreenLock", words.noScreenLock)
                .put("noScreenLockBody", words.noScreenLockBody)
        preferences.edit { putString(WORDS_KEY, stored.toString()) }
    }

    private fun storedWords(): LockWords? {
        val stored = preferences.getString(WORDS_KEY, null) ?: return null
        return runCatching {
            val words = JSONObject(stored)
            LockWords(
                title = words.getString("title"),
                body = words.getString("body"),
                unlock = words.getString("unlock"),
                prompt = words.getString("prompt"),
                noScreenLock = words.getString("noScreenLock"),
                noScreenLockBody = words.getString("noScreenLockBody"),
            )
        }.onFailure { Logger.warn("the app lock's kept words could not be read: ${it.message}") }
            .getOrNull()
    }
}
