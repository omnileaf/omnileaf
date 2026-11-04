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
    role = "alert",
    class: className,
    children,
    ...restProps
  }: Omit<
    WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
    "role"
  > & {
    icon: IconComponent;
    role?: "alert" | "status";
  } = $props();
</script>

<div
  bind:this={ref}
  data-slot="alert"
  {role}
  class={cn(
    "flex items-start gap-3 rounded-control border border-border bg-card p-4 text-foreground",
    className,
  )}
  {...restProps}
>
  <Icon class="mbs-0.5 shrink-0 text-accent-ink block-4 inline-4" />
  <div class="grid gap-1 min-inline-0">
    {@render children?.()}
  </div>
</div>
