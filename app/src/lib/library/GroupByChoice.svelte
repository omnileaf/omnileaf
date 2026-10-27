<script lang="ts">
  import type { LibraryGrouping } from "#lib/ipc/bindings.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";

  const GROUPINGS: readonly LibraryGrouping[] = ["none", "category", "folder"];

  const LABELS = {
    none: m.library_group_none,
    category: m.library_group_category,
    folder: m.library_group_folder,
    creator: m.library_group_creator,
  } satisfies Record<LibraryGrouping, () => string>;

  let {
    chosen,
    onChoose,
  }: {
    chosen: LibraryGrouping;
    onChoose: (grouping: LibraryGrouping) => void;
  } = $props();

  const id = $props.id();
  const labelId = `${id}-label`;
</script>

<div>
  <p id={labelId} class="text-body font-medium large:text-small">
    {m.library_group_by()}
  </p>
  <SegmentedControl
    options={GROUPINGS}
    labels={LABELS}
    {chosen}
    labelledBy={labelId}
    size="small"
    {onChoose}
    class="mbs-sm large:mbs-icon-gap"
  />
</div>
