<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Switch } from "#lib/components/ui/switch/index.ts";

  interface Props {
    readonly label: string;
    readonly description?: string;
    readonly isOn: boolean;
    readonly onToggle: () => void;
    readonly class?: ClassValue;
  }

  let {
    label,
    description,
    isOn,
    onToggle,
    class: className,
  }: Props = $props();

  const id = $props.id();
</script>

<Switch
  bind:checked={() => isOn, onToggle}
  aria-labelledby="{id}-label"
  aria-describedby={description === undefined ? undefined : `${id}-description`}
  class={[
    "flex items-center gap-md px-lg py-md text-start inline-full min-block-touch-target hover:tint-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:tint-pressed",
    className,
  ]}
>
  <span class="flex flex-1 flex-col gap-2xs">
    <span id="{id}-label" class="font-medium expanded:font-semibold"
      >{label}</span
    >
    {#if description !== undefined}
      <span id="{id}-description" class="text-detail text-muted"
        >{description}</span
      >
    {/if}
  </span>
</Switch>
