<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import { getTapOpenTabSetting } from "./tap-open-tab.svelte.ts";

  const tapOpenTab = getTapOpenTabSetting();
</script>

<SettingSwitch
  bleeds
  label={m.tap_open_tab()}
  description={m.tap_open_tab_help()}
  isOn={tapOpenTab.isOn}
  onToggle={() => {
    tapOpenTab.turn(!tapOpenTab.isOn);
  }}
/>
