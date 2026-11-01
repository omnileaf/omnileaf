<script lang="ts">
  import { ITEM_LOOKS, ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { MAC_INSPECTOR_SMART } from "./filter-sheet-look";

  let {
    label,
    description,
    isOn,
    usesItemRow = false,
    isInspector = false,
    titleClass,
    onToggle,
  }: {
    label: string;
    description?: string;
    isOn: boolean;
    usesItemRow?: boolean;
    isInspector?: boolean;
    titleClass?: string | undefined;
    onToggle: (isOn: boolean) => void;
  } = $props();

  const id = $props.id();
  const isMac = currentPlatform() === "macos";
  const isCheckbox = $derived(isMac && !isInspector);
  const titleType = $derived(
    isInspector
      ? MAC_INSPECTOR_SMART.title
      : (titleClass ?? "text-body font-medium large:text-small"),
  );
  const rowType = $derived.by(() => {
    if (isInspector) {
      return MAC_INSPECTOR_SMART.row;
    }
    return usesItemRow
      ? ITEM_LOOKS["row-static"]
      : "flex items-center gap-md py-setting-grid-pad text-start inline-full min-block-setting-grid-row";
  });
  const wordsType = $derived(
    isInspector ? MAC_INSPECTOR_SMART.words : "flex flex-1 flex-col gap-2xs",
  );
  const descriptionType = $derived(
    isInspector
      ? MAC_INSPECTOR_SMART.description
      : "text-small text-muted large:text-caption",
  );
</script>

{#if isCheckbox}
  <label
    class={[
      "flex items-center gap-md py-setting-grid-pad text-start inline-full min-block-setting-grid-row",
      ROW_FOCUS_RING,
    ]}
  >
    <Checkbox
      bind:checked={() => isOn, onToggle}
      aria-labelledby="{id}-label"
      aria-describedby={description === undefined
        ? undefined
        : `${id}-description`}
    />
    <span class="flex flex-1 flex-col gap-2xs">
      <span
        id="{id}-label"
        data-slot={usesItemRow ? "item-title" : undefined}
        class={usesItemRow ? undefined : titleType}
      >
        {label}
      </span>
      {#if description !== undefined}
        <span
          id="{id}-description"
          data-slot={usesItemRow ? "item-description" : undefined}
          class={usesItemRow
            ? "text-muted"
            : "text-small text-muted large:text-caption"}
        >
          {description}
        </span>
      {/if}
    </span>
  </label>
{:else}
  <Switch
    bind:checked={() => isOn, onToggle}
    aria-labelledby="{id}-label"
    aria-describedby={description === undefined
      ? undefined
      : `${id}-description`}
    class={[rowType, ROW_FOCUS_RING]}
  >
    <span class={wordsType}>
      <span
        id="{id}-label"
        data-slot={usesItemRow ? "item-title" : undefined}
        class={usesItemRow ? undefined : titleType}
      >
        {label}
      </span>
      {#if description !== undefined}
        <span
          id="{id}-description"
          data-slot={usesItemRow ? "item-description" : undefined}
          class={usesItemRow ? "text-muted" : descriptionType}
        >
          {description}
        </span>
      {/if}
    </span>
  </Switch>
{/if}
