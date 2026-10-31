<script lang="ts">
  import { X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  const ICON_SIZE = 16;

  let { label, onDismiss }: { label: string; onDismiss: () => void } = $props();

  const isWindows = currentPlatform() === "windows";
</script>

{#if isWindows}
  <Button
    variant="plain"
    iconOnly
    {label}
    class="absolute inset-e-native-info-bar-close-inset inset-bs-native-info-bar-close-inset block-native-info-bar-close inline-native-info-bar-close"
    onclick={onDismiss}
  >
    <X size={ICON_SIZE} aria-hidden="true" />
  </Button>
{:else}
  <Tooltip
    {label}
    type="button"
    aria-label={label}
    onclick={onDismiss}
    class="isolate col-start-3 row-start-1 -my-sm -me-sm flex shrink-0 items-center justify-center self-start rounded-full opacity-70 transition-control block-touch-target inline-touch-target before:absolute before:z-behind before:rounded-full before:transition-control before:block-pointer-target before:inline-pointer-target hover:opacity-100 hover:before:bg-hover focus-visible:focus-ring active:opacity-100 active:before:bg-pressed desktop:-my-xs desktop:-me-xs desktop:block-dismiss desktop:inline-dismiss"
  >
    <X size={ICON_SIZE} class="relative" />
  </Tooltip>
{/if}
