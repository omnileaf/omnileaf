<script lang="ts">
  import { Sun } from "@lucide/svelte";
  import { Dialog, Popover } from "bits-ui";

  import {
    DrawerContent,
    SheetHeader,
  } from "#lib/components/ui/drawer/index.ts";
  import { PopoverContent } from "#lib/components/ui/popover/index.ts";
  import { cn } from "#lib/components/cn.ts";
  import { m } from "#lib/paraglide/messages.js";

  import LightSliders from "./LightSliders.svelte";
  import { quickSettingLook } from "./quick-setting.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderIcon from "./ReaderIcon.svelte";
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
  const chrome = getReaderChrome();
  const look = $derived(quickSettingLook(chrome.platform, chrome.width));
  const opensSheet = $derived(chrome.floats);

  function open(isNowOpen: boolean): void {
    isOpen = isNowOpen;
    onOpenChange(isNowOpen);
  }

  function close(): void {
    open(false);
  }
</script>

<button
  bind:this={button}
  type="button"
  aria-pressed={light.isOn}
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  class={cn(look.button, look.toggle, light.isOn && look.on)}
  onclick={() => {
    const isOn = !light.isOn;
    onChange({ ...light, isOn });
    open(isOn);
  }}
>
  <ReaderIcon
    name="sun"
    fallback={Sun}
    isKit={look.hasKitIcons}
    size={look.iconSize}
    class="shrink-0"
  />
  <span class={look.toggleLabel}>{m.reader_light()}</span>
</button>
{#if opensSheet}
  <Dialog.Root
    open={isOpen}
    onOpenChange={(isNowOpen: boolean) => {
      if (!isNowOpen) {
        close();
      }
    }}
  >
    <DrawerContent to="main" height="medium" backdrop="clear" onDismiss={close}>
      <SheetHeader
        title={m.reader_light_title()}
        doneLabel={m.reader_settings_done()}
        onDone={close}
      />
      <div class="overflow-y-auto px-sheet-inline pbs-md pbe-sheet-bottom">
        <LightSliders {light} {onChange} />
      </div>
    </DrawerContent>
  </Dialog.Root>
{:else}
  <Popover.Root
    open={isOpen}
    onOpenChange={(isNowOpen: boolean) => {
      if (!isNowOpen) {
        close();
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
{/if}
