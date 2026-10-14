<script lang="ts">
  import { Slider as SliderPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    value = $bindable(0),
    class: className,
    "aria-label": label,
    "aria-labelledby": labelledBy,
    ...restProps
  }: Omit<
    Extract<SliderPrimitive.RootProps, { type: "single" }>,
    "type" | "value"
  > & { value?: number } = $props();
</script>

<SliderPrimitive.Root
  type="single"
  bind:value
  class={cn(
    "relative flex touch-none items-center select-none block-lg data-disabled:opacity-50 touch:block-touch-target",
    className,
  )}
  {...restProps}
>
  <span
    class="relative grow overflow-hidden rounded-full bg-chip block-slider-track"
  >
    <SliderPrimitive.Range class="absolute bg-accent block-full" />
  </span>
  <SliderPrimitive.Thumb
    index={0}
    aria-label={label}
    aria-labelledby={labelledBy}
    class="block rounded-full border border-accent bg-background shadow-card-rest transition-control block-lg inline-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  />
</SliderPrimitive.Root>
