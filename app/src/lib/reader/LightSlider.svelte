<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import { Slider } from "#lib/components/ui/slider/index.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { getTextDirection } from "#lib/paraglide/runtime.js";

  import { ANDROID_PHONE_LOOK } from "./page-slider-look.ts";
  import ProgressSlider from "./ProgressSlider.svelte";

  const STEP = 1;
  const LOWEST = 0;
  const HIGHEST = 100;
  const ANDROID_ROOT = "flex flex-none touch-none select-none";
  const ANDROID_INPUT = "block-touch-target";

  let {
    labelledBy,
    value,
    class: className,
    onChange,
  }: {
    labelledBy: string;
    value: number;
    class?: string | undefined;
    onChange: (value: number) => void;
  } = $props();

  const android = new AndroidPhone();
</script>

{#if android.isOn}
  <ProgressSlider
    look={ANDROID_PHONE_LOOK}
    {value}
    min={LOWEST}
    max={HIGHEST}
    step={STEP}
    dir={getTextDirection()}
    {labelledBy}
    inputClass={ANDROID_INPUT}
    class={cn(ANDROID_ROOT, className)}
    {onChange}
  />
{:else}
  <Slider
    aria-labelledby={labelledBy}
    class={className}
    min={LOWEST}
    max={HIGHEST}
    step={STEP}
    bind:value={() => value, onChange}
  />
{/if}
