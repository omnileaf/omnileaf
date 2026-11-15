package app.omnileaf

import android.content.Context
import android.os.Build
import androidx.core.content.edit

private const val PREFERENCES = "app_lock"
private const val IS_ON_KEY = "is_on"
private const val LOCK_AFTER_KEY = "lock_after"
private const val HIDES_CONTENT_IN_RECENTS_KEY = "hides_content_in_recents"
private const val TITLE_KEY = "words_title"
private const val BODY_KEY = "words_body"
private const val UNLOCK_KEY = "words_unlock"
private const val PROMPT_KEY = "words_prompt"
private val WORD_KEYS = listOf(TITLE_KEY, BODY_KEY, UNLOCK_KEY, PROMPT_KEY)

internal class AppLockChoices(
    context: Context,
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

    val words: LockWords?
        get() {
            val stored = WORD_KEYS.associateWith { preferences.getString(it, null) ?: return null }
            return LockWords().also {
                it.title = stored.getValue(TITLE_KEY)
                it.body = stored.getValue(BODY_KEY)
                it.unlock = stored.getValue(UNLOCK_KEY)
                it.prompt = stored.getValue(PROMPT_KEY)
            }
        }

    fun remember(words: LockWords) {
        preferences.edit {
            putString(TITLE_KEY, words.title)
            putString(BODY_KEY, words.body)
            putString(UNLOCK_KEY, words.unlock)
            putString(PROMPT_KEY, words.prompt)
        }
    }
}
