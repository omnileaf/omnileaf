package app.omnileaf

internal class AutomaticCheckSwitch(
    private val state: UpdateState,
    private val background: BackgroundUpdateCheck,
) {
    fun turn(isOn: Boolean) {
        state.isAutomatic = isOn
        background.sync(state)
    }
}
