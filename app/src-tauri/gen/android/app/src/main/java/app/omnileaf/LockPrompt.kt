package app.omnileaf

internal class LockPrompt {
    private var isOpen = false
    private var isWaitingForFocus = false

    fun open(): Boolean {
        if (isOpen) return false
        isOpen = true
        isWaitingForFocus = false
        return true
    }

    fun close() {
        isOpen = false
    }

    fun isStillInTheApp(isChangingScreens: Boolean): Boolean = isChangingScreens || isOpen

    fun waitForFocus() {
        isWaitingForFocus = !isOpen
    }

    fun focusArrived(): Boolean {
        val wasWaiting = isWaitingForFocus
        isWaitingForFocus = false
        return wasWaiting
    }
}
