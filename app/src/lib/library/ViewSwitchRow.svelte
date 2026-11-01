<script lang="ts">
  import { ITEM_LOOKS, ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  let {
    label,
    description,
    isOn,
    isMaterial = false,
    onToggle,
  }: {
    label: string;
    description?: string;
    isOn: boolean;
    isMaterial?: boolean;
    onToggle: (isOn: boolean) => void;
  } = $props();

  const id = $props.id();
  const isCheckbox = currentPlatform() === "macos";
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
        data-slot={isMaterial ? "item-title" : undefined}
        class={isMaterial
          ? undefined
          : "text-body font-medium large:text-small"}
      >
        {label}
      </span>
      {#if description !== undefined}
        <span
          id="{id}-description"
          data-slot={isMaterial ? "item-description" : undefined}
          class={isMaterial
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
    class={[
      isMaterial
        ? ITEM_LOOKS["row-static"]
        : "flex items-center gap-md py-setting-grid-pad text-start inline-full min-block-setting-grid-row",
      ROW_FOCUS_RING,
    ]}
  >
    <span class="flex flex-1 flex-col gap-2xs">
      <span
        id="{id}-label"
        data-slot={isMaterial ? "item-title" : undefined}
        class={isMaterial
          ? undefined
          : "text-body font-medium large:text-small"}
      >
        {label}
      </span>
      {#if description !== undefined}
        <span
          id="{id}-description"
          data-slot={isMaterial ? "item-description" : undefined}
          class={isMaterial
            ? "text-muted"
            : "text-small text-muted large:text-caption"}
        >
          {description}
        </span>
      {/if}
    </span>
  </Switch>
{/if}
