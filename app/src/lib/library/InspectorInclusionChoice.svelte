<script lang="ts" generics="Option extends string">
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";

  import { MAC_INSPECTOR } from "./filter-sheet-look";

  let {
    label,
    hint,
    options,
    labels,
    chosen,
    onChoose,
  }: {
    label: string;
    hint: string;
    options: readonly Option[];
    labels: Record<Option, () => string>;
    chosen: Option;
    onChoose: (option: Option) => void;
  } = $props();

  const id = $props.id();
</script>

<div class="flex flex-col gap-sm">
  <p {id} class={MAC_INSPECTOR.label}>{label}</p>
  <p id="{id}-hint" class={MAC_INSPECTOR.note}>{hint}</p>
  <SegmentedControl
    {options}
    {labels}
    {chosen}
    labelledBy={id}
    describedBy="{id}-hint"
    size="small"
    class="self-start"
    {onChoose}
  />
</div>
