<script lang="ts">
  import type { LibraryGrouping } from "#lib/ipc/bindings.ts";
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import { AndroidPhone } from "./android-phone.svelte";
  import {
    ANDROID_VIEW_SETTING,
    FILTER_SETTING_LABEL_TYPE,
  } from "./filter-sheet-look";

  const GROUPINGS: readonly LibraryGrouping[] = [
    "none",
    "category",
    "folder",
    "creator",
  ];

  const LABELS = {
    none: m.library_group_none,
    category: m.library_group_category,
    folder: m.library_group_folder,
    creator: m.library_group_creator,
  } satisfies Record<LibraryGrouping, () => string>;

  let {
    chosen,
    onChoose,
    labelClass,
  }: {
    chosen: LibraryGrouping;
    onChoose: (grouping: LibraryGrouping) => void;
    labelClass?: string | undefined;
  } = $props();

  const id = $props.id();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const android = new AndroidPhone();
</script>

<div class={android.isOn ? ANDROID_VIEW_SETTING.row : ""}>
  <p
    id={labelId}
    class={android.isOn
      ? [ANDROID_VIEW_SETTING.words, FILTER_SETTING_LABEL_TYPE]
      : (labelClass ?? "text-body font-medium large:text-small")}
  >
    {m.library_group_by()}
  </p>
  <SegmentedControl
    options={GROUPINGS}
    labels={LABELS}
    {chosen}
    labelledBy={labelId}
    describedBy={hintId}
    size="small"
    hasWindowsLook
    {onChoose}
    class={android.isOn
      ? "flex-none max-inline-full"
      : "mbs-sm large:mbs-icon-gap"}
  />
  <p
    id={hintId}
    class={android.isOn
      ? [ANDROID_VIEW_SETTING.note, ROW_SUBTITLE_TYPE]
      : "mbs-xs text-small text-muted large:text-caption"}
  >
    {m.library_group_creator_hint()}
  </p>
</div>
