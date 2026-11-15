package app.omnileaf

internal class LockPrompt {
    private var isOpen = false

    fun open(): Boolean {
        if (isOpen) return false
        isOpen = true
        return true
    }

    fun close() {
        isOpen = false
    }

    fun isStillInTheApp(isChangingScreens: Boolean): Boolean = isChangingScreens || isOpen
}
