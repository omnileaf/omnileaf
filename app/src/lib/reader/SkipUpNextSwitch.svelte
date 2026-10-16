<script lang="ts">
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getSkipUpNextSetting } from "#lib/up-next/skip-up-next.svelte.ts";

  const skipUpNext = getSkipUpNextSetting();
  const id = $props.id();
</script>

<Switch
  bind:checked={
    () => skipUpNext.isOn,
    (isOn: boolean) => {
      skipUpNext.turn(isOn);
    }
  }
  aria-labelledby="{id}-skip"
  aria-describedby="{id}-skip-description"
  class="flex items-center gap-md py-setting-grid-pad text-start min-block-setting-grid-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
>
  <span class="flex flex-1 flex-col gap-2xs">
    <span id="{id}-skip" class="text-small font-medium">
      {m.reading_skip_up_next()}
    </span>
    <span id="{id}-skip-description" class="text-caption text-muted">
      {m.reading_skip_up_next_help()}
    </span>
  </span>
</Switch>
