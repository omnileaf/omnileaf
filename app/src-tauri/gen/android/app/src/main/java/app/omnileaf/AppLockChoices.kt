package app.omnileaf

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

private const val PREFERENCES = "app_lock"
private const val IS_ON_KEY = "is_on"
private const val LOCK_AFTER_KEY = "lock_after"
private const val TITLE_KEY = "words_title"
private const val BODY_KEY = "words_body"
private const val UNLOCK_KEY = "words_unlock"
private const val PROMPT_KEY = "words_prompt"
private const val TURNED_OFF_KEY = "words_turned_off"
private val WORD_KEYS = listOf(TITLE_KEY, BODY_KEY, UNLOCK_KEY, PROMPT_KEY, TURNED_OFF_KEY)

internal class AppLockChoices(
    private val context: Context,
) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    val isOn: Boolean
        get() = preferences.getBoolean(IS_ON_KEY, false)

    val lockAfter: LockAfter
        get() = LockAfter.of(preferences.getString(LOCK_AFTER_KEY, null))

    fun turn(isOn: Boolean) {
        preferences.edit { putBoolean(IS_ON_KEY, isOn) }
    }

    fun chooseLockAfter(lockAfter: LockAfter) {
        preferences.edit { putString(LOCK_AFTER_KEY, lockAfter.id) }
    }

    fun wordsToShow(): LockWords = storedWords()?.takeIf { it.isComplete } ?: LockWords.builtIn(context)

    fun remember(words: LockWords) {
        preferences.edit {
            putString(TITLE_KEY, words.title)
            putString(BODY_KEY, words.body)
            putString(UNLOCK_KEY, words.unlock)
            putString(PROMPT_KEY, words.prompt)
            putString(TURNED_OFF_KEY, words.turnedOff)
        }
    }

    fun startFollowingIsOn(follow: (Boolean) -> Unit): SharedPreferences.OnSharedPreferenceChangeListener =
        SharedPreferences
            .OnSharedPreferenceChangeListener { _, key ->
                if (key == IS_ON_KEY) follow(isOn)
            }.also(preferences::registerOnSharedPreferenceChangeListener)

    fun stopFollowing(listener: SharedPreferences.OnSharedPreferenceChangeListener) {
        preferences.unregisterOnSharedPreferenceChangeListener(listener)
    }

    private fun storedWords(): LockWords? {
        val stored = WORD_KEYS.associateWith { preferences.getString(it, null) ?: return null }
        return LockWords(
            title = stored.getValue(TITLE_KEY),
            body = stored.getValue(BODY_KEY),
            unlock = stored.getValue(UNLOCK_KEY),
            prompt = stored.getValue(PROMPT_KEY),
            turnedOff = stored.getValue(TURNED_OFF_KEY),
        )
    }
}
