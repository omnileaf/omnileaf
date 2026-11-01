<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import type { WithElementRef } from "bits-ui";
  import type { HTMLSelectAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  const ICON_SIZE = 16;

  let {
    ref = $bindable(null),
    class: className,
    fieldClass,
    icon: Icon = ChevronDown,
    iconSize = ICON_SIZE,
    children,
    ...restProps
  }: WithElementRef<HTMLSelectAttributes, HTMLSelectElement> & {
    fieldClass?: string;
    icon?: typeof ChevronDown;
    iconSize?: number;
  } = $props();
</script>

<div class={cn("relative flex items-center", className)}>
  <select
    bind:this={ref}
    class={cn(
      "flex-1 appearance-none rounded-select border border-select-edge bg-select ps-md pe-select-end text-label text-ellipsis block-panel-field min-inline-none macos:shadow-raised windows:border-be-windows-stroke-strong linux:shadow-raised",
      fieldClass,
    )}
    {...restProps}
  >
    {@render children?.()}
  </select>
  <Icon
    size={iconSize}
    aria-hidden="true"
    class="pointer-events-none absolute inset-e-pill-inline text-muted"
  />
</div>
