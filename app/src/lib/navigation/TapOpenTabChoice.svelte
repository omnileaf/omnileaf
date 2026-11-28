<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import { FLUSH_FOOTER } from "#lib/settings/android-flush-look.ts";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import { getTapOpenTabSetting } from "./tap-open-tab.svelte.ts";

  const tapOpenTab = getTapOpenTabSetting();
</script>

<SettingSwitch
  bleeds
  label={m.tap_open_tab()}
  isOn={tapOpenTab.isOn}
  onToggle={() => {
    tapOpenTab.turn(!tapOpenTab.isOn);
  }}
/>
<p class={FLUSH_FOOTER}>
  {tapOpenTab.isOn ? m.tap_open_tab_on_note() : m.tap_open_tab_off_note()}
</p>
