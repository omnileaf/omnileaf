<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    platform,
    isBusy,
    onclick,
  }: {
    platform: Platform;
    isBusy: boolean;
    onclick: () => void;
  } = $props();

  function change(): void {
    if (!isBusy) {
      onclick();
    }
  }
</script>

<Button
  type="button"
  look="card-outline"
  aria-disabled={isBusy || undefined}
  onclick={change}
>
  {platform === "macos"
    ? m.first_launch_home_change_macos()
    : m.first_launch_home_change()}
</Button>
