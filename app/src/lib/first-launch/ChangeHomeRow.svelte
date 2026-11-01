<script lang="ts">
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";

  let {
    ref = $bindable(null),
    titleId,
    pathId,
    isBusy,
    onclick,
  }: {
    ref?: HTMLButtonElement | null;
    titleId: string;
    pathId: string;
    isBusy: boolean;
    onclick: () => void;
  } = $props();

  function change(): void {
    if (!isBusy) {
      onclick();
    }
  }
</script>

<button
  bind:this={ref}
  type="button"
  aria-disabled={isBusy || undefined}
  aria-labelledby={titleId}
  aria-describedby={pathId}
  class={[
    "absolute inset-none transition-control not-aria-disabled:hover:bg-hover not-aria-disabled:active:bg-pressed",
    ROW_FOCUS_RING,
  ]}
  onclick={change}
></button>
