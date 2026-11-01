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
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import { AndroidPhone } from "./android-phone.svelte";
  import {
    ANDROID_VIEW_SETTING,
    FILTER_SETTING_LABEL_TYPE,
  } from "./filter-sheet-look";

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
    labelClass,
  }: {
    chosen: LibraryDisplay;
    onChoose: (display: LibraryDisplay) => void;
    labelClass?: string | undefined;
  } = $props();

  const id = $props.id();
  const platform = currentPlatform();
  const width = new WindowWidth();
  const android = new AndroidPhone();
  const showsIcons = $derived(phoneOf(platform, width.current) === undefined);
  const labelId = `${id}-label`;
</script>

<div class={android.isOn ? ANDROID_VIEW_SETTING.row : ""}>
  <p
    id={labelId}
    class={android.isOn
      ? [ANDROID_VIEW_SETTING.words, FILTER_SETTING_LABEL_TYPE]
      : (labelClass ?? "text-body font-medium large:text-small")}
  >
    {m.library_view_display()}
  </p>
  <SegmentedControl
    options={DISPLAYS}
    labels={LABELS}
    icons={showsIcons ? ICONS : undefined}
    {chosen}
    labelledBy={labelId}
    size="small"
    hasWindowsLook
    {onChoose}
    class={android.isOn
      ? "flex-none max-inline-full"
      : "mbs-sm large:mbs-icon-gap"}
  />
</div>
