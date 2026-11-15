package app.omnileaf

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.view.ContextThemeWrapper
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.MaterialColors

private const val TITLE_SIZE_SP = 24f
private const val BODY_SIZE_SP = 16f
private const val GAP_DP = 16

internal class LockCover(
    private val activity: Activity,
    private val onUnlock: () -> Unit,
) {
    private var shown: View? = null

    val isShown: Boolean
        get() = shown != null

    fun show(words: LockWords) {
        if (shown != null) return
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        val cover = coverWith(words)
        content.addView(cover, FrameLayout.LayoutParams(MATCH, MATCH))
        hideBehind(content, cover, isHidden = true)
        shown = cover
    }

    fun hide() {
        val cover = shown ?: return
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        content.removeView(cover)
        hideBehind(content, cover, isHidden = false)
        shown = null
    }

    private fun coverWith(words: LockWords): View {
        val themed = ContextThemeWrapper(activity, RememberedTheme(activity).theme().coverStyle(activity))
        val onSurface = MaterialColors.getColor(themed, com.google.android.material.R.attr.colorOnSurface, 0)
        val onSurfaceVariant =
            MaterialColors.getColor(themed, com.google.android.material.R.attr.colorOnSurfaceVariant, 0)
        val gap = (GAP_DP * activity.resources.displayMetrics.density).toInt()
        val column =
            LinearLayout(themed).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                addView(text(themed, words.title, TITLE_SIZE_SP, onSurface))
                addView(text(themed, words.body, BODY_SIZE_SP, onSurfaceVariant), spaced(gap))
                addView(
                    MaterialButton(themed).apply {
                        text = words.unlock
                        setOnClickListener { onUnlock() }
                    },
                    spaced(gap * 2),
                )
            }
        return FrameLayout(themed).apply {
            setBackgroundColor(activity.getColor(RememberedTheme(activity).theme().pageBackground()))
            isClickable = true
            isFocusable = true
            addView(column, FrameLayout.LayoutParams(WRAP, WRAP, Gravity.CENTER))
        }
    }

    private fun text(
        context: Context,
        words: String,
        sizeSp: Float,
        color: Int,
    ): TextView =
        TextView(context).apply {
            text = words
            textSize = sizeSp
            setTextColor(color)
            gravity = Gravity.CENTER
        }

    private fun spaced(top: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(WRAP, WRAP).apply {
            topMargin = top
        }

    private fun hideBehind(
        content: ViewGroup,
        cover: View,
        isHidden: Boolean,
    ) {
        val importance =
            if (isHidden) View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS else View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
        for (index in 0 until content.childCount) {
            val child = content.getChildAt(index)
            if (child != cover) child.importantForAccessibility = importance
        }
    }
}

private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

private fun StartingTheme.coverStyle(activity: Activity): Int =
    when (this) {
        StartingTheme.LIGHT -> {
            R.style.Theme_omnileaf_app_Light
        }

        StartingTheme.DARK -> {
            R.style.Theme_omnileaf_app_Dark
        }

        StartingTheme.DEVICE -> {
            if (activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES) {
                R.style.Theme_omnileaf_app_Dark
            } else {
                R.style.Theme_omnileaf_app_Light
            }
        }
    }
