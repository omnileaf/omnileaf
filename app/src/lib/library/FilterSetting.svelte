<script lang="ts" generics="Option extends string">
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";

  import { FILTER_SETTING_LABEL_TYPE } from "./filter-sheet-look";

  let {
    label,
    hint,
    options,
    labels,
    chosen,
    isRow = false,
    onChoose,
  }: {
    label: string;
    hint?: string;
    options: readonly Option[];
    labels: Record<Option, () => string>;
    chosen: Option;
    isRow?: boolean;
    onChoose: (option: Option) => void;
  } = $props();

  const id = $props.id();
</script>

<div
  class={[
    "flex gap-sm py-sm ps-lg pe-xl",
    isRow ? "flex-wrap items-center gap-x-lg" : "flex-col",
  ]}
>
  <div class="flex flex-1 flex-col gap-2xs min-inline-none">
    <span id="{id}-label" class={FILTER_SETTING_LABEL_TYPE}>{label}</span>
    {#if hint !== undefined}
      <span class="{ROW_SUBTITLE_TYPE} text-muted">{hint}</span>
    {/if}
  </div>
  <SegmentedControl
    {options}
    {labels}
    {chosen}
    labelledBy="{id}-label"
    isFullWidth={!isRow}
    class={isRow && "flex-none"}
    {onChoose}
  />
</div>
