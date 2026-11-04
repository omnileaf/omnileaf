<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type {
    IconComponent,
    WithElementRef,
  } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    icon: Icon,
    class: className,
    ...restProps
  }: Omit<
    WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
    "children"
  > & { icon: IconComponent } = $props();
</script>

<div
  bind:this={ref}
  data-slot="empty-media"
  class={cn(
    "flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink block-12 inline-12",
    className,
  )}
  {...restProps}
>
  <Icon class="block-6 inline-6" />
</div>
