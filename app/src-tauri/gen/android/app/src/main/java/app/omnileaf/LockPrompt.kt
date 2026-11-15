package app.omnileaf

internal class LockPrompt {
    var isOpen = false
        private set

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
