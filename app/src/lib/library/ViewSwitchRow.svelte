<script lang="ts">
  import { Switch } from "#lib/components/ui/switch/index.ts";

  let {
    label,
    description,
    isOn,
    onToggle,
  }: {
    label: string;
    description?: string;
    isOn: boolean;
    onToggle: (isOn: boolean) => void;
  } = $props();

  const id = $props.id();
</script>

<Switch
  bind:checked={() => isOn, onToggle}
  aria-labelledby="{id}-label"
  aria-describedby={description === undefined ? undefined : `${id}-description`}
  class="flex items-center gap-md py-setting-grid-pad text-start inline-full min-block-setting-grid-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
>
  <span class="flex flex-1 flex-col gap-2xs">
    <span id="{id}-label" class="text-body font-medium large:text-small">
      {label}
    </span>
    {#if description !== undefined}
      <span
        id="{id}-description"
        class="text-small text-muted large:text-caption"
      >
        {description}
      </span>
    {/if}
  </span>
</Switch>
