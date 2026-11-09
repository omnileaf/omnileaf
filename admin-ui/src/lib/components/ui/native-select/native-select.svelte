<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import type { HTMLSelectAttributes } from "svelte/elements";

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
    fieldClass,
    children,
    ...restProps
  }: WithElementRef<Omit<HTMLSelectAttributes, "value">, HTMLSelectElement> & {
    value?: string | undefined;
    fieldClass?: string;
  } = $props();
</script>

<div
  data-slot="native-select-wrapper"
  class={cn("relative flex items-center", className)}
>
  <select
    bind:this={ref}
    bind:value
    data-slot="native-select"
    class={cn(
      FIELD_LOOK,
      CONTROL_HEIGHT,
      FOCUS_RING,
      "appearance-none pe-10",
      fieldClass,
    )}
    {...restProps}
  >
    {@render children?.()}
  </select>
  <ChevronDown
    class="pointer-events-none absolute inset-e-3 text-muted block-4 inline-4"
  />
</div>
