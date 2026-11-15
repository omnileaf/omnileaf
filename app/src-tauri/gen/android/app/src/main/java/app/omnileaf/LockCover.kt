package app.omnileaf

import android.app.Activity
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.view.ContextThemeWrapper
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton

private const val GAP_DP = 16
private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

internal class LockCover(
    private val activity: Activity,
    private val onUnlock: () -> Unit,
) {
    private var shown: Shown? = null

    val isShown: Boolean
        get() = shown != null

    fun show(words: LockWords) {
        if (shown != null) return
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        val cover = coverWith(words)
        val behind = (0 until content.childCount).map { Behind(content.getChildAt(it)) }
        content.addView(cover.root, FrameLayout.LayoutParams(MATCH, MATCH))
        behind.forEach(Behind::shutOut)
        cover.root.requestFocus()
        WindowCompat.getInsetsController(activity.window, cover.root).hide(WindowInsetsCompat.Type.ime())
        shown = cover.copy(behind = behind)
    }

    fun sayNoScreenLock(words: LockWords) {
        val cover = shown ?: return
        cover.title.text = words.noScreenLock
        cover.body.text = words.noScreenLockBody
    }

    fun hide() {
        val cover = shown ?: return
        activity.findViewById<ViewGroup>(android.R.id.content).removeView(cover.root)
        cover.behind.forEach(Behind::letBackIn)
        shown = null
    }

    private fun coverWith(words: LockWords): Shown {
        val theme = RememberedTheme(activity).theme()
        val themed = ContextThemeWrapper(activity, theme.style())
        val gap = (GAP_DP * activity.resources.displayMetrics.density).toInt()
        val title = text(themed, words.title, com.google.android.material.R.style.TextAppearance_Material3_HeadlineSmall)
        val body = text(themed, words.body, com.google.android.material.R.style.TextAppearance_Material3_BodyLarge)
        val column =
            LinearLayout(themed).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                addView(title)
                addView(body, spaced(gap))
                addView(
                    MaterialButton(themed).apply {
                        text = words.unlock
                        setOnClickListener { onUnlock() }
                    },
                    spaced(gap * 2),
                )
            }
        val root =
            FrameLayout(themed).apply {
                setBackgroundColor(activity.getColor(theme.pageBackground()))
                isClickable = true
                isFocusable = true
                isFocusableInTouchMode = true
                addView(column, FrameLayout.LayoutParams(WRAP, WRAP, Gravity.CENTER))
            }
        return Shown(root, title, body)
    }

    private fun text(
        themed: ContextThemeWrapper,
        words: String,
        appearance: Int,
    ): TextView =
        TextView(themed).apply {
            text = words
            setTextAppearance(appearance)
            gravity = Gravity.CENTER
        }

    private fun spaced(top: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(WRAP, WRAP).apply {
            topMargin = top
        }

    private data class Shown(
        val root: View,
        val title: TextView,
        val body: TextView,
        val behind: List<Behind> = emptyList(),
    )

    private class Behind(
        private val view: View,
    ) {
        private val importance = view.importantForAccessibility
        private val focusability = (view as? ViewGroup)?.descendantFocusability

        fun shutOut() {
            view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            (view as? ViewGroup)?.descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
        }

        fun letBackIn() {
            view.importantForAccessibility = importance
            if (view is ViewGroup && focusability != null) {
                view.descendantFocusability = focusability
            }
        }
    }
}
