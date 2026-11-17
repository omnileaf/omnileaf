package app.omnileaf

private const val CHANNEL_KEY = "wordsChannel"
private const val TITLE_KEY = "wordsTitle"
private const val VIEW_RELEASE_KEY = "wordsViewRelease"
private const val SKIP_KEY = "wordsSkip"
private val WORD_KEYS = listOf(CHANNEL_KEY, TITLE_KEY, VIEW_RELEASE_KEY, SKIP_KEY)

internal class RememberedNoticeWords(
    private val store: UpdateStore,
) {
    fun remember(words: UpdateNoticeWords) {
        store.write(
            mapOf(
                CHANNEL_KEY to words.channel,
                TITLE_KEY to words.title,
                VIEW_RELEASE_KEY to words.viewRelease,
                SKIP_KEY to words.skip,
            ),
        )
    }

    fun toShow(builtIn: () -> UpdateNoticeWords): UpdateNoticeWords = remembered()?.takeIf { it.isComplete } ?: builtIn()

    private fun remembered(): UpdateNoticeWords? {
        val snapshot = store.snapshot()
        val stored = WORD_KEYS.associateWith { snapshot[it] ?: return null }
        return UpdateNoticeWords(
            channel = stored.getValue(CHANNEL_KEY),
            title = stored.getValue(TITLE_KEY),
            viewRelease = stored.getValue(VIEW_RELEASE_KEY),
            skip = stored.getValue(SKIP_KEY),
        )
    }
}
