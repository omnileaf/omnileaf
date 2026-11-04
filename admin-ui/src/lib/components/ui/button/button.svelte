<script lang="ts">
  import { cn } from "#lib/cn.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";

  import type { ButtonProps } from "./props.ts";
  import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from "./variants.ts";

  let {
    ref = $bindable(null),
    class: className,
    variant = "default",
    size = "default",
    type = "button",
    children,
    ...restProps
  }: ButtonProps = $props();
</script>

<button
  bind:this={ref}
  data-slot="button"
  class={cn(
    BUTTON_BASE,
    FOCUS_RING,
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  )}
  {type}
  {...restProps}
>
  {@render children?.()}
</button>
