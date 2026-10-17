<script lang="ts">
  import { Slider } from "#lib/components/ui/slider/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { ReaderLight } from "./reader-settings.svelte.ts";

  const STEP = 1;
  const HIGHEST = 100;

  let {
    light,
    isInRows = false,
    onChange,
  }: {
    light: ReaderLight;
    isInRows?: boolean;
    onChange: (light: ReaderLight) => void;
  } = $props();

  const id = $props.id();
</script>

<div class="flex flex-col gap-md">
  <div
    class={[
      "flex flex-col gap-sm",
      isInRows &&
        "expanded:grid expanded:grid-cols-setting-row expanded:items-center expanded:gap-md",
    ]}
  >
    <p id="{id}-brightness" class="text-small font-medium">
      {m.reader_brightness()}
    </p>
    <Slider
      aria-labelledby="{id}-brightness"
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
  <div
    class={[
      "flex flex-col gap-sm",
      isInRows &&
        "expanded:grid expanded:grid-cols-setting-row expanded:items-center expanded:gap-md",
    ]}
  >
    <p id="{id}-warmth" class="text-small font-medium">{m.reader_warmth()}</p>
    <Slider
      aria-labelledby="{id}-warmth"
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
</div>
