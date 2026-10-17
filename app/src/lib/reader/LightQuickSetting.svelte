<script lang="ts">
  import { Sun } from "@lucide/svelte";
  import { Popover } from "bits-ui";

  import { PopoverContent } from "#lib/components/ui/popover/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import LightSliders from "./LightSliders.svelte";
  import {
    QUICK_SETTING_ICON_SIZE,
    QUICK_SETTING_LOOK,
    QUICK_SETTING_ON,
  } from "./quick-setting.ts";
  import type { ReaderLight } from "./reader-settings.svelte.ts";

  let {
    light,
    onChange,
    onOpenChange,
  }: {
    light: ReaderLight;
    onChange: (light: ReaderLight) => void;
    onOpenChange: (isOpen: boolean) => void;
  } = $props();

  let button: HTMLButtonElement | undefined = $state();
  let isOpen = $state(false);
  const titleId = $props.id();

  function open(isNowOpen: boolean): void {
    isOpen = isNowOpen;
    onOpenChange(isNowOpen);
  }
</script>

<button
  bind:this={button}
  type="button"
  aria-pressed={light.isOn}
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  class={[QUICK_SETTING_LOOK, light.isOn && QUICK_SETTING_ON]}
  onclick={() => {
    const isOn = !light.isOn;
    onChange({ ...light, isOn });
    open(isOn);
  }}
>
  <Sun size={QUICK_SETTING_ICON_SIZE} aria-hidden="true" class="shrink-0" />
  {m.reader_light()}
</button>
<Popover.Root
  open={isOpen}
  onOpenChange={(isNowOpen: boolean) => {
    if (!isNowOpen) {
      open(false);
    }
  }}
>
  <PopoverContent
    to="main"
    customAnchor={button}
    aria-labelledby={titleId}
    class="flex flex-col gap-md p-lg inline-reader-light"
  >
    <p id={titleId} class="text-small font-semibold">
      {m.reader_light_title()}
    </p>
    <LightSliders {light} {onChange} />
  </PopoverContent>
</Popover.Root>
