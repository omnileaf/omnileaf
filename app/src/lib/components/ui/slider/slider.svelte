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
    "group/slider relative flex touch-none items-center select-none block-lg data-disabled:opacity-50 windows:block-native-slider touch:block-touch-target",
    className,
  )}
  {...restProps}
>
  <span
    class="relative grow overflow-hidden rounded-full bg-chip block-slider-track windows:bg-native-progress-track windows:block-native-slider-track"
  >
    <SliderPrimitive.Range
      class="absolute bg-accent block-full windows:bg-native-progress-fill"
    />
  </span>
  <SliderPrimitive.Thumb
    index={0}
    aria-label={label}
    aria-labelledby={labelledBy}
    class="block rounded-full border border-accent bg-background shadow-card-rest transition-control block-lg inline-lg focus-visible:focus-ring windows:flex windows:items-center windows:justify-center windows:border-native-switch-off-border windows:bg-native-menu windows:shadow-none windows:block-native-slider-thumb windows:inline-native-slider-thumb windows:before:rounded-full windows:before:bg-native-progress-fill windows:before:block-native-slider-thumb-core windows:before:inline-native-slider-thumb-core windows:group-hover/slider:before:block-native-slider-thumb-core-hover windows:group-hover/slider:before:inline-native-slider-thumb-core-hover windows:focus-visible:ring-1 windows:focus-visible:ring-native-focus-ring-inner"
  />
</SliderPrimitive.Root>
