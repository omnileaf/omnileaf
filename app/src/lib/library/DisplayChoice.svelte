<script lang="ts">
  import {
    Grid3x3,
    Images,
    LayoutGrid,
    List,
    type LucideProps,
  } from "@lucide/svelte";
  import type { Component } from "svelte";

  import type { LibraryDisplay } from "#lib/ipc/bindings.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";

  const DISPLAYS: readonly LibraryDisplay[] = [
    "grid",
    "compact",
    "covers",
    "list",
  ];

  const LABELS = {
    grid: m.library_display_grid,
    compact: m.library_display_compact,
    covers: m.library_display_covers,
    list: m.library_display_list,
  } satisfies Record<LibraryDisplay, () => string>;

  const ICONS = {
    grid: LayoutGrid,
    compact: Grid3x3,
    covers: Images,
    list: List,
  } satisfies Record<LibraryDisplay, Component<LucideProps>>;

  let {
    chosen,
    onChoose,
  }: { chosen: LibraryDisplay; onChoose: (display: LibraryDisplay) => void } =
    $props();

  const group = $props.id();
  const labelId = `${group}-label`;
</script>

<div>
  <p
    id={labelId}
    class="text-detail font-semibold text-muted large:text-caption"
  >
    {m.library_view_display()}
  </p>
  <SegmentedControl
    name={group}
    options={DISPLAYS}
    labels={LABELS}
    icons={ICONS}
    {chosen}
    labelledBy={labelId}
    size="small"
    {onChoose}
    class="mbs-sm large:mbs-icon-gap"
  />
</div>
