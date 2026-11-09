<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import LightSlider from "./LightSlider.svelte";
  import type { ReaderLight } from "./reader-settings.svelte.ts";

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
  const control = $derived(isInRows ? "inline-setting-control" : undefined);

  function setBrightness(brightness: number): void {
    onChange({ ...light, isOn: true, brightness });
  }

  function setWarmth(warmth: number): void {
    onChange({ ...light, isOn: true, warmth });
  }
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
    <LightSlider
      labelledBy="{id}-brightness"
      value={light.brightness}
      class={control}
      onChange={setBrightness}
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
      <LightSlider
        labelledBy="{id}-warmth"
        value={light.warmth}
        class={control}
        onChange={setWarmth}
      />
    </div>
  {/if}
</div>
