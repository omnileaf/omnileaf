<script lang="ts">
  import PickingBarControl from "./PickingBarControl.svelte";

  let {
    controls,
    isPickingAll,
    isAllPicked,
    onEnd,
    onPickAll,
    onPickNone,
  }: {
    controls: readonly ("close" | "done" | "selectAll")[];
    isPickingAll: boolean;
    isAllPicked: boolean;
    onEnd: () => void;
    onPickAll: () => void;
    onPickNone: () => void;
  } = $props();
</script>

{#each controls as control (control)}
  <PickingBarControl
    {control}
    {isPickingAll}
    {isAllPicked}
    {onEnd}
    {onPickAll}
    {onPickNone}
  />
{/each}
