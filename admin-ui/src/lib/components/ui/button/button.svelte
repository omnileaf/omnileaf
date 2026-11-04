<script lang="ts">
  import { cn } from "#lib/cn.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";

  import type { ButtonProps } from "./props.ts";
  import { buttonLook } from "./variants.ts";

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
  class={cn(buttonLook(variant, size), FOCUS_RING, className)}
  {type}
  {...restProps}
>
  {@render children?.()}
</button>
