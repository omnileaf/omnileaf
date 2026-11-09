<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import {
    CONTROL_HEIGHT,
    FIELD_LOOK,
    FOCUS_RING,
  } from "#lib/components/ui/controls.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...restProps
  }: WithElementRef<Omit<HTMLInputAttributes, "value">, HTMLInputElement> & {
    value?: string | number | undefined;
  } = $props();
</script>

<input
  bind:this={ref}
  bind:value
  data-slot="input"
  class={cn(FIELD_LOOK, CONTROL_HEIGHT, FOCUS_RING, className)}
  {...restProps}
/>
