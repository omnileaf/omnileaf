<script lang="ts">
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { ReaderSettings } from "./reader-settings.svelte.ts";
  import { hasVolumeKeys } from "./volume-keys.ts";

  const SWITCH_ROW =
    "flex items-center gap-md py-setting-grid-pad text-start min-block-setting-grid-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  let { settings }: { settings: ReaderSettings } = $props();

  const id = $props.id();
  const look = $derived(settings.look);
</script>

{#if hasVolumeKeys(currentPlatform())}
  <Switch
    bind:checked={
      () => look.turnsPagesWithVolumeKeys,
      (isOn: boolean) => {
        settings.change("turnsPagesWithVolumeKeys", isOn);
      }
    }
    aria-labelledby="{id}-volume-keys"
    aria-describedby="{id}-volume-keys-description"
    class={SWITCH_ROW}
  >
    <span class="flex flex-1 flex-col gap-2xs">
      <span id="{id}-volume-keys" class="text-small font-medium">
        {m.reader_volume_keys()}
      </span>
      <span id="{id}-volume-keys-description" class="text-caption text-muted">
        {m.reader_volume_keys_help()}
      </span>
    </span>
  </Switch>
{/if}
