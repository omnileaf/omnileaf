<script lang="ts">
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { ReaderSettings } from "./reader-settings.svelte.ts";

  const SWITCH_ROW =
    "flex items-center gap-md py-setting-grid-pad text-start text-small font-medium min-block-setting-grid-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  let { settings }: { settings: ReaderSettings } = $props();

  const look = $derived(settings.look);
</script>

<Switch
  bind:checked={
    () => look.keepsScreenOn,
    (isOn: boolean) => {
      settings.change("keepsScreenOn", isOn);
    }
  }
  class={SWITCH_ROW}
>
  <span class="flex-1">{m.reader_keep_screen_on()}</span>
</Switch>
