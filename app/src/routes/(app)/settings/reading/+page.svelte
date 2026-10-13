<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";
  import { getSkipUpNextSetting } from "#lib/up-next/skip-up-next.svelte.ts";

  const skipUpNext = getSkipUpNextSetting();
</script>

<SectionHeading title={m.reading_title()} />
<div class="mbs-pane-gap flex flex-col gap-pane-gap">
  <SettingSwitch
    label={m.reading_skip_up_next()}
    description={m.reading_skip_up_next_help()}
    isOn={skipUpNext.isOn}
    onToggle={() => {
      skipUpNext.turn(!skipUpNext.isOn);
    }}
    class="rounded-card border border-border bg-card"
  />
</div>
