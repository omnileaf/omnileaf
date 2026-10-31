<script lang="ts">
  import { Slider as SliderPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  import { WINDOWS_SLIDER_THUMB } from "./windows-slider.ts";

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
    class={cn(
      "block rounded-full border border-accent bg-background shadow-card-rest transition-control block-lg inline-lg focus-visible:focus-ring",
      WINDOWS_SLIDER_THUMB,
      "windows:focus-visible:ring-1 windows:focus-visible:ring-native-focus-ring-inner",
    )}
  />
</SliderPrimitive.Root>
