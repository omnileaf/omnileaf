<script lang="ts">
  import { Slider } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import type { TextDirection } from "#lib/navigation/back-swipe.ts";

  import type { ProgressSliderLook } from "./page-slider-look.ts";

  const INPUT =
    "absolute inset-none mx-none my-auto cursor-pointer opacity-0 inline-full";

  let {
    look,
    value,
    min,
    max,
    step,
    dir,
    label,
    labelledBy,
    valueText,
    inputClass,
    class: className,
    onChange,
    onCommit = () => undefined,
    onPointerDown,
    onFocusChange,
  }: {
    look: ProgressSliderLook;
    value: number;
    min: number;
    max: number;
    step: number;
    dir: TextDirection;
    valueText?: string | undefined;
    inputClass: string;
    class?: string | undefined;
    onChange: (value: number) => void;
    onCommit?: (() => void) | undefined;
    onPointerDown?: (() => void) | undefined;
    onFocusChange?: ((isFocused: boolean) => void) | undefined;
  } & (
    | { label: string; labelledBy?: never }
    | { labelledBy: string; label?: never }
  ) = $props();

  const progress = $derived(max > min ? (value - min) / (max - min) : 0);
</script>

<Slider.Root
  type="single"
  {min}
  {max}
  {step}
  {value}
  {dir}
  thumbPositioning="exact"
  onValueChange={onChange}
  onValueCommit={onCommit}
  class={cn(look.root, className)}
  style={`--progress: ${String(progress)}`}
  onpointerdown={onPointerDown}
>
  <div class={look.track}>
    <div class={look.fill}></div>
  </div>
  <div data-progress-thumb class={look.thumb}></div>
  <Slider.Thumb index={0}>
    {#snippet child({ props }: { props: Record<string, unknown> })}
      <input
        {...props}
        style={undefined}
        type="range"
        {min}
        {max}
        {step}
        {value}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-valuetext={valueText}
        class={cn(INPUT, inputClass)}
        oninput={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
        onfocus={() => {
          onFocusChange?.(true);
        }}
        onblur={() => {
          onFocusChange?.(false);
        }}
      />
    {/snippet}
  </Slider.Thumb>
</Slider.Root>
