package app.omnileaf

import android.app.Activity
import android.content.res.ColorStateList
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.ColorRes
import androidx.annotation.StyleRes
import androidx.appcompat.view.ContextThemeWrapper
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton

private const val GAP_DP = 16
private const val ICON_DP = 72
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
        if (isShown) return
        val cover = coverWith(words, Behind(activity.findViewById(android.R.id.content)))
        decor.addView(cover.root, FrameLayout.LayoutParams(MATCH, MATCH))
        cover.behind.shutOut()
        cover.root.requestFocus()
        WindowCompat.getInsetsController(activity.window, cover.root).hide(WindowInsetsCompat.Type.ime())
        shown = cover
    }

    fun hide() {
        val cover = shown ?: return
        decor.removeView(cover.root)
        cover.behind.letBackIn()
        shown = null
    }

    private val decor: ViewGroup
        get() = activity.window.decorView as ViewGroup

    private fun coverWith(
        words: LockWords,
        behind: Behind,
    ): Shown {
        val theme = RememberedTheme(activity).theme()
        val themed = ContextThemeWrapper(activity, theme.style())
        val colours = theme.lockColours()
        val density = activity.resources.displayMetrics.density
        val gap = (GAP_DP * density).toInt()
        val iconSize = (ICON_DP * density).toInt()
        val title =
            text(themed, words.title, com.google.android.material.R.style.TextAppearance_Material3_HeadlineSmall, colours.onSurface)
        val body =
            text(themed, words.body, com.google.android.material.R.style.TextAppearance_Material3_BodyLarge, colours.onSurfaceMuted)
        val column =
            LinearLayout(themed).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                addView(
                    ImageView(themed).apply {
                        setImageResource(R.mipmap.ic_launcher)
                        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                    },
                    LinearLayout.LayoutParams(iconSize, iconSize),
                )
                addView(title, spaced(gap))
                addView(body, spaced(gap))
                addView(unlockButton(themed, words, colours), spaced(gap * 2))
            }
        val root =
            FrameLayout(themed).apply {
                setBackgroundColor(activity.getColor(theme.pageBackground()))
                isClickable = true
                isFocusable = true
                isFocusableInTouchMode = true
                addView(column, FrameLayout.LayoutParams(WRAP, WRAP, Gravity.CENTER))
            }
        return Shown(root, behind)
    }

    private fun unlockButton(
        themed: ContextThemeWrapper,
        words: LockWords,
        colours: LockColours,
    ): MaterialButton =
        MaterialButton(themed).apply {
            text = words.unlock
            setIconResource(R.drawable.ic_lock)
            backgroundTintList = ColorStateList.valueOf(activity.getColor(colours.primary))
            val onPrimary = ColorStateList.valueOf(activity.getColor(colours.onPrimary))
            setTextColor(onPrimary)
            iconTint = onPrimary
            setOnClickListener { onUnlock() }
        }

    private fun text(
        themed: ContextThemeWrapper,
        words: String,
        @StyleRes appearance: Int,
        @ColorRes colour: Int,
    ): TextView =
        TextView(themed).apply {
            text = words
            setTextAppearance(appearance)
            setTextColor(activity.getColor(colour))
            gravity = Gravity.CENTER
        }

    private fun spaced(top: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(WRAP, WRAP).apply {
            topMargin = top
        }

    private class Shown(
        val root: View,
        val behind: Behind,
    )

    private class Behind(
        private val view: View,
    ) {
        private val visibility = view.visibility

        fun shutOut() {
            view.visibility = View.INVISIBLE
        }

        fun letBackIn() {
            view.visibility = visibility
        }
    }
}
