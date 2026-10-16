<script lang="ts">
  import { X } from "@lucide/svelte";

  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";

  const ICON_SIZE = 16;

  let { label, onDismiss }: { label: string; onDismiss: () => void } = $props();
</script>

<Tooltip
  {label}
  type="button"
  aria-label={label}
  onclick={onDismiss}
  class="isolate col-start-3 row-start-1 -my-sm -me-sm flex shrink-0 items-center justify-center self-start rounded-full opacity-70 transition-control block-touch-target inline-touch-target before:absolute before:z-behind before:rounded-full before:transition-control before:block-pointer-target before:inline-pointer-target hover:opacity-100 hover:before:bg-hover focus-visible:focus-ring active:opacity-100 active:before:bg-pressed desktop:-my-xs desktop:-me-xs desktop:block-dismiss desktop:inline-dismiss"
>
  <X size={ICON_SIZE} class="relative" />
</Tooltip>
