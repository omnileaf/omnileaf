<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";

  import { getNumberField, type StepDirection } from "./number-field.svelte.ts";

  let {
    direction,
    label,
    class: className,
    children,
  }: {
    direction: StepDirection;
    label: string;
    class?: ClassValue;
    children: Snippet;
  } = $props();

  const field = getNumberField();
</script>

<Tooltip
  {label}
  type="button"
  aria-label={label}
  disabled={!field.canStep(direction)}
  class={className}
  onclick={() => {
    field.step(direction);
  }}
>
  {@render children()}
</Tooltip>
