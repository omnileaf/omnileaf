<script lang="ts">
  import { ChevronLeft, ChevronRight, Keyboard } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import type { Platform } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";
  import {
    SCREENSHOT_MODE_OPTIONS,
    type ScreenshotModeOption,
  } from "$lib/screenshot-mode/screenshot-mode";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";
  import ScreenshotModePreview from "$lib/screenshot-mode/ScreenshotModePreview.svelte";
  import ShortcutKeys from "$lib/screenshot-mode/ShortcutKeys.svelte";
  import { screenshotModeStatus } from "$lib/screenshot-mode/status";
  import SettingSwitch from "$lib/settings/SettingSwitch.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const OPTION_TEXT = {
    blankReaderPages: {
      label: m.screenshot_mode_blank_pages,
      help: m.screenshot_mode_blank_pages_help,
    },
    showLabel: {
      label: m.screenshot_mode_show_label,
      help: () =>
        hasKeyboard
          ? m.screenshot_mode_show_label_help_desktop()
          : m.screenshot_mode_show_label_help(),
    },
    turnOffAfterAnHour: {
      label: m.screenshot_mode_auto_off,
      help: m.screenshot_mode_auto_off_help,
    },
  } satisfies Record<
    ScreenshotModeOption,
    { label: () => string; help: () => string }
  >;

  const KEYBOARD_PLATFORMS: ReadonlySet<Platform> = new Set([
    "linux",
    "macos",
    "windows",
  ]);

  const CHEVRON_SIZE = 18;
  const KEYBOARD_ICON_SIZE = 18;

  const screenshotMode = getScreenshotMode();
  const hasKeyboard = $derived(KEYBOARD_PLATFORMS.has(data.appInfo.platform));
  const id = $props.id();
</script>

<a
  href={resolve("/settings/privacy")}
  class="inline-flex items-center gap-2xs font-medium text-accent min-block-touch-target hover:underline expanded:text-detail expanded:font-semibold"
>
  <ChevronLeft size={CHEVRON_SIZE} class="expanded:hidden rtl:-scale-x-100" />
  {m.privacy_title()}
  <ChevronRight
    size={CHEVRON_SIZE}
    class="max-expanded:hidden rtl:-scale-x-100"
  />
</a>
<h1 tabindex="-1" class="text-headline font-bold">
  {m.screenshot_mode_title()}
</h1>

<div
  class="mbs-xl flex flex-col expanded:grid expanded:grid-with-preview expanded:items-start expanded:gap-xl"
>
  <SettingSwitch
    label={m.screenshot_mode_title()}
    description={screenshotModeStatus(screenshotMode.activity)}
    isOn={screenshotMode.isOn}
    onToggle={() => {
      screenshotMode.toggle();
    }}
    prominence="main"
    class="rounded-card border border-border bg-card max-expanded:rounded-ee-none max-expanded:rounded-es-none expanded:col-start-1"
  >
    {#snippet trailing()}
      {#if hasKeyboard}
        <ShortcutKeys platform={data.appInfo.platform} />
      {/if}
    {/snippet}
  </SettingSwitch>

  <div
    class="max-expanded:contents expanded:col-start-2 expanded:row-span-full expanded:flex expanded:flex-col expanded:gap-md expanded:rounded-card expanded:border expanded:border-border expanded:bg-card expanded:p-lg"
  >
    <figure
      aria-labelledby="{id}-preview"
      class="flex flex-col gap-md max-expanded:rounded-ee-card max-expanded:rounded-es-card max-expanded:border max-expanded:border-bs-0 max-expanded:border-border max-expanded:bg-card max-expanded:p-lg"
    >
      <figcaption
        id="{id}-preview"
        class="text-detail font-semibold text-muted max-expanded:sr-only"
      >
        {m.screenshot_mode_preview()}
      </figcaption>
      <ScreenshotModePreview isOn={screenshotMode.isOn} />
    </figure>
    <p
      class="text-detail text-muted max-expanded:mbs-sm max-expanded:px-xs expanded:border-bs expanded:border-border expanded:pbs-md"
    >
      {m.screenshot_mode_what_changes()}
    </p>
  </div>

  <div
    class="max-expanded:contents expanded:col-start-1 expanded:flex expanded:flex-col expanded:gap-xl"
  >
    <section
      aria-labelledby="{id}-while-on"
      class="flex flex-col gap-sm max-expanded:mbs-xl"
    >
      <h2 id="{id}-while-on" class="px-xs text-detail font-semibold text-muted">
        {m.screenshot_mode_while_on()}
      </h2>
      <div
        class="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card"
      >
        {#each SCREENSHOT_MODE_OPTIONS as option (option)}
          <SettingSwitch
            label={OPTION_TEXT[option].label()}
            description={OPTION_TEXT[option].help()}
            isOn={screenshotMode.options[option]}
            onToggle={() => {
              screenshotMode.choose({
                option,
                isChosen: !screenshotMode.options[option],
              });
            }}
          />
        {/each}
      </div>
    </section>

    {#if hasKeyboard}
      <section
        aria-labelledby="{id}-quickly"
        class="flex flex-col gap-sm max-expanded:mbs-xl"
      >
        <h2
          id="{id}-quickly"
          class="px-xs text-detail font-semibold text-muted"
        >
          {m.screenshot_mode_quickly()}
        </h2>
        <div
          class="flex items-center gap-md rounded-card border border-border bg-card px-lg py-md min-block-touch-target"
        >
          <span
            class="flex shrink-0 items-center justify-center rounded-control bg-chip p-xs"
          >
            <Keyboard size={KEYBOARD_ICON_SIZE} />
          </span>
          <span class="flex flex-1 flex-col gap-2xs">
            <span class="font-medium expanded:font-semibold">
              {m.screenshot_mode_shortcut()}
            </span>
            <span class="text-detail text-muted">
              {m.screenshot_mode_shortcut_help()}
            </span>
          </span>
          <ShortcutKeys platform={data.appInfo.platform} />
        </div>
      </section>
    {/if}

    <p class="px-xs text-detail text-muted max-expanded:mbs-sm">
      {m.screenshot_mode_nothing_sent()}
    </p>
  </div>
</div>
