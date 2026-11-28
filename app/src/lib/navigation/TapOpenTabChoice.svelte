<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import { getTapOpenTabSetting } from "./tap-open-tab.svelte.ts";

  const tapOpenTab = getTapOpenTabSetting();
</script>

<SettingSwitch
  bleeds
  label={m.tap_open_tab()}
  description={tapOpenTab.isOn
    ? m.tap_open_tab_on_note()
    : m.tap_open_tab_off_note()}
  isOn={tapOpenTab.isOn}
  onToggle={() => {
    tapOpenTab.turn(!tapOpenTab.isOn);
  }}
/>
