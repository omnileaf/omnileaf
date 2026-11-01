<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import {
    getOpensOnSetting,
    OPENING_PLACES,
    type OpeningPlace,
  } from "#lib/general/opens-on.svelte.ts";
  import {
    getTimeFormatSetting,
    TIME_FORMATS,
    type TimeFormat,
  } from "#lib/general/time-format.svelte.ts";
  import {
    LANGUAGE_CHOICES,
    type LanguageChoice,
    languageName,
    systemLanguage,
  } from "#lib/language/language.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
  import ValueLinkRow from "#lib/settings/ValueLinkRow.svelte";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingChoiceRow from "#lib/settings/SettingChoiceRow.svelte";
  import { radiosLook } from "#lib/settings/radios-look.ts";
  import SettingRadios from "#lib/settings/SettingRadios.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import type { PageProps } from "./$types";

  const CHEVRON_SIZE = 18;

  let { data }: PageProps = $props();

  const width = new WindowWidth();
  const onPhone = $derived(isPhone(data.appInfo.platform, width.current));
  const isIosPhone = $derived(data.appInfo.platform === "ios" && onPhone);

  const id = $props.id();
  const hintId = `${id}-hint`;

  const android = new AndroidPhone();
  const language = getLanguageSetting();
  const dateHeading = radiosLook(true).heading;
  const showsRadioHints = currentPlatform() !== "macos";
  const opensOn = getOpensOnSetting();
  const timeFormat = getTimeFormatSetting();

  const PLACE_LABELS = {
    library: m.general_opens_library(),
    history: m.general_opens_history(),
    lastBook: m.general_opens_last_book(),
  } satisfies Record<OpeningPlace, string>;

  const systemHourCycle = new Intl.DateTimeFormat(getLocale(), {
    hour: "numeric",
  }).resolvedOptions().hourCycle;
  const TIME_FORMAT_LABELS = {
    system:
      systemHourCycle === "h11" || systemHourCycle === "h12"
        ? m.general_time_system_12()
        : m.general_time_system_24(),
    twelveHour: m.general_time_12(),
    twentyFourHour: m.general_time_24(),
  } satisfies Record<TimeFormat, string>;
</script>

<GroupedGround>
  <SectionHeading title={m.general_title()} />
  {#if isIosPhone}
    <div class="mbs-pane-gap flex flex-col gap-xl">
      <div
        class={`flex flex-col divide-y divide-ios-separator overflow-hidden ${GROUP_PLATE}`}
      >
        <ValueLinkRow
          route="/(app)/settings/general/opens-on"
          label={m.general_opens_on()}
          value={PLACE_LABELS[opensOn.choice]}
        />
        <ValueLinkRow
          route="/(app)/settings/general/language"
          label={m.language_label()}
          value={languageName(getLocale())}
        />
      </div>
      <div class="flex flex-col gap-sm">
        <h2 class="ps-lg text-native-row-title/native-row-title text-muted">
          {m.general_dates_and_numbers()}
        </h2>
        <div class={`flex flex-col overflow-hidden ${GROUP_PLATE}`}>
          <ValueLinkRow
            route="/(app)/settings/general/time-format"
            label={m.general_time_format()}
            value={TIME_FORMAT_LABELS[timeFormat.choice]}
          />
        </div>
      </div>
    </div>
  {:else if android.isOn}
    <div class="mbs-pane-gap flex flex-col gap-pane-gap">
      <SettingRadios
        title={m.general_opens_on()}
        options={OPENING_PLACES}
        labels={PLACE_LABELS}
        hints={{}}
        chosen={opensOn.choice}
        onChoose={(place: OpeningPlace) => {
          opensOn.choose(place);
        }}
      />
      <div class="flex flex-col">
        <SettingChoiceRow
          title={m.language_label()}
          value={languageName(
            language.choice === "system" ? getLocale() : language.choice,
          )}
          valueLang={language.choice === "system"
            ? getLocale()
            : language.choice}
          choices={LANGUAGE_CHOICES.map((choice) => ({
            value: choice,
            label:
              choice === "system"
                ? m.language_use_system()
                : languageName(choice),
            lang: choice === "system" ? undefined : choice,
            hint:
              choice === "system" ? languageName(systemLanguage()) : undefined,
          }))}
          chosen={language.choice}
          onChoose={(choice: LanguageChoice) => {
            language.choose(choice);
          }}
        />
        <div class="-mx-page-start -me-page-end">
          <h2 class={dateHeading}>{m.general_dates_and_numbers()}</h2>
        </div>
        <SettingChoiceRow
          title={m.general_time_format()}
          value={TIME_FORMAT_LABELS[timeFormat.choice]}
          choices={TIME_FORMATS.map((format) => ({
            value: format,
            label: TIME_FORMAT_LABELS[format],
          }))}
          chosen={timeFormat.choice}
          onChoose={(format: TimeFormat) => {
            timeFormat.choose(format);
          }}
        />
      </div>
    </div>
  {:else}
    <div class="mbs-pane-gap flex flex-col gap-pane-gap macos:gap-lg">
      <SettingRadios
        title={m.general_opens_on()}
        options={OPENING_PLACES}
        labels={PLACE_LABELS}
        hints={{ lastBook: m.general_opens_last_book_hint() }}
        hintsAreShown={showsRadioHints}
        chosen={opensOn.choice}
        onChoose={(place: OpeningPlace) => {
          opensOn.choose(place);
        }}
      />
      <div class="flex flex-col gap-sm">
        <div class="rounded-list border border-border bg-card">
          <a
            href={resolve("/(app)/settings/general/language")}
            aria-describedby={onPhone ? hintId : undefined}
            class={[
              "flex items-center gap-md rounded-list py-xs ps-lg pe-md transition-control min-block-phone-row hover:bg-hover active:bg-pressed",
              "touch:medium:py-none touch:medium:ps-list-row touch:medium:min-block-touch-target",
              "desktop:py-none desktop:ps-list-row desktop:min-block-settings-row",
            ]}
          >
            <span class="flex-1 font-semibold desktop:text-callout">
              {m.language_label()}
            </span>
            <span
              lang={getLocale()}
              class="text-callout text-muted touch:medium:text-label desktop:text-label"
            >
              {languageName(getLocale())}
            </span>
            <ChevronRight
              size={CHEVRON_SIZE}
              class="shrink-0 text-muted rtl:-scale-x-100"
            />
          </a>
        </div>
        {#if onPhone}
          <p id={hintId} class="px-xs text-footnote text-muted">
            {m.language_phone_hint()}
          </p>
        {/if}
      </div>
      <SettingRadios
        title={m.general_time_format()}
        options={TIME_FORMATS}
        labels={TIME_FORMAT_LABELS}
        chosen={timeFormat.choice}
        onChoose={(format: TimeFormat) => {
          timeFormat.choose(format);
        }}
      />
    </div>
  {/if}
</GroupedGround>
