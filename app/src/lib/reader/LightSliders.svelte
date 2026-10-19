<script lang="ts">
  import { Slider } from "#lib/components/ui/slider/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { ReaderLight } from "./reader-settings.svelte.ts";

  const STEP = 1;
  const HIGHEST = 100;

  let {
    light,
    isInRows = false,
    showsWarmth = true,
    onChange,
  }: {
    light: ReaderLight;
    isInRows?: boolean;
    showsWarmth?: boolean;
    onChange: (light: ReaderLight) => void;
  } = $props();

  const id = $props.id();
</script>

<div class={["flex flex-col", isInRows ? "divide-y divide-border" : "gap-md"]}>
  <div
    class={[
      "flex flex-col gap-sm",
      isInRows &&
        "grid grid-cols-setting-grid items-center gap-x-md py-setting-grid-pad min-block-setting-grid-row",
    ]}
  >
    <p id="{id}-brightness" class="text-small font-medium">
      {m.reader_brightness()}
    </p>
    <Slider
      aria-labelledby="{id}-brightness"
      class={isInRows ? "inline-setting-control" : undefined}
      min={0}
      max={HIGHEST}
      step={STEP}
      bind:value={
        () => light.brightness,
        (brightness: number) => {
          onChange({ ...light, isOn: true, brightness });
        }
      }
    />
  </div>
  {#if showsWarmth}
    <div
      class={[
        "flex flex-col gap-sm",
        isInRows &&
          "grid grid-cols-setting-grid items-center gap-x-md py-setting-grid-pad min-block-setting-grid-row",
      ]}
    >
      <p id="{id}-warmth" class="text-small font-medium">{m.reader_warmth()}</p>
      <Slider
        aria-labelledby="{id}-warmth"
        class={isInRows ? "inline-setting-control" : undefined}
        min={0}
        max={HIGHEST}
        step={STEP}
        bind:value={
          () => light.warmth,
          (warmth: number) => {
            onChange({ ...light, isOn: true, warmth });
          }
        }
      />
    </div>
  {/if}
</div>
