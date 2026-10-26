<script lang="ts">
  import { X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 20;

  let {
    control,
    isPickingAll,
    isAllPicked,
    onEnd,
    onPickAll,
    onPickNone,
  }: {
    control: "close" | "done" | "selectAll";
    isPickingAll: boolean;
    isAllPicked: boolean;
    onEnd: () => void;
    onPickAll: () => void;
    onPickNone: () => void;
  } = $props();
</script>

{#if control === "close"}
  <Tooltip
    label={m.series_clear_selection()}
    type="button"
    aria-label={m.series_clear_selection()}
    aria-keyshortcuts="Escape"
    onclick={onEnd}
  >
    {#snippet child({ props })}
      <Button {...props} look="header-control" class="shrink-0">
        <X size={ICON_SIZE} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
{:else if control === "done"}
  <Button
    type="button"
    variant="primary"
    aria-keyshortcuts="Escape"
    class="shrink-0 max-inline-full"
    onclick={onEnd}
  >
    {m.series_selection_done()}
  </Button>
{:else}
  <Button
    type="button"
    variant="plain"
    aria-busy={isAllPicked ? undefined : isPickingAll}
    class="shrink-0 max-inline-full"
    onclick={isAllPicked ? onPickNone : onPickAll}
  >
    {isAllPicked ? m.series_deselect_all() : m.series_select_all()}
  </Button>
{/if}
