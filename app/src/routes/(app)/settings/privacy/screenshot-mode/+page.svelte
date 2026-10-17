<script lang="ts">
  import { Keyboard } from "@lucide/svelte";

  import { getTimeFormatSetting } from "#lib/general/time-format.svelte.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import ShortcutKeys from "#lib/screenshot-mode/ShortcutKeys.svelte";
  import { screenshotModeSummary } from "#lib/screenshot-mode/status.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSelect from "#lib/settings/SettingSelect.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import type { PageProps } from "./$types";

  type SwitchedOption = "blankReaderPages" | "showLabel";

  const SWITCHED_OPTIONS: readonly SwitchedOption[] = [
    "blankReaderPages",
    "showLabel",
  ];
  const AFTER_AN_HOUR = "hour";
  const NEVER = "never";
  const KEYBOARD_ICON_SIZE = 18;
  const CARD =
    "flex flex-col overflow-hidden rounded-card border border-border bg-card android:rounded-android-md android:border-transparent android:bg-android-container-low";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
  const timeFormat = getTimeFormatSetting();
  const hasKeyboard = $derived(isPointer(data.appInfo.platform));
  const quicklyId = $props.id();

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
  } satisfies Record<
    SwitchedOption,
    { label: () => string; help: () => string }
  >;
</script>

<SectionHeading
  title={m.screenshot_mode_title()}
  parent={{ route: "/(app)/settings/privacy", title: m.privacy_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-xl">
  <div class="flex flex-col gap-sm">
    <p class="text-detail text-muted">{m.screenshot_mode_intro()}</p>
    <div class={[CARD, "divide-y divide-border"]}>
      <SettingSwitch
        label={m.screenshot_mode_title()}
        description={screenshotModeSummary(
          screenshotMode.activity,
          timeFormat.hourCycle,
        )}
        isOn={screenshotMode.isOn}
        onToggle={() => {
          screenshotMode.toggle();
        }}
      />
      <SettingSelect
        label={m.screenshot_mode_turn_off_after()}
        options={[
          { value: AFTER_AN_HOUR, label: m.screenshot_mode_turn_off_hour() },
          { value: NEVER, label: m.screenshot_mode_turn_off_never() },
        ]}
        value={screenshotMode.options.turnOffAfterAnHour
          ? AFTER_AN_HOUR
          : NEVER}
        onChoose={(value) => {
          screenshotMode.choose({
            option: "turnOffAfterAnHour",
            isChosen: value === AFTER_AN_HOUR,
          });
        }}
      />
      {#each SWITCHED_OPTIONS as option (option)}
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
  </div>

  {#if hasKeyboard}
    <section aria-labelledby={quicklyId} class={CARD}>
      <h2 id={quicklyId} class="px-lg pbs-md pbe-xs text-small font-semibold">
        {m.screenshot_mode_quickly()}
      </h2>
      <div class="flex items-center gap-md px-lg pbs-xs pbe-md">
        <span
          aria-hidden="true"
          class="flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile"
        >
          <Keyboard size={KEYBOARD_ICON_SIZE} />
        </span>
        <span class="flex flex-1 flex-col gap-2xs">
          <span class="font-semibold desktop:text-callout">
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
</div>
