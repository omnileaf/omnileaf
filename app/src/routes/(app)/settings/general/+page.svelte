<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
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
  import { languageName } from "#lib/language/language.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone } from "#lib/page/platform.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingRadios from "#lib/settings/SettingRadios.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import type { PageProps } from "./$types";

  const CHEVRON_SIZE = 18;

  let { data }: PageProps = $props();

  const width = new WindowWidth();
  const onPhone = $derived(isPhone(data.appInfo.platform, width.current));

  const id = $props.id();
  const hintId = `${id}-hint`;
  const datesId = `${id}-dates`;
  const timeFormatId = `${id}-time-format`;

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

  function chooseTimeFormat(
    event: Event & { currentTarget: HTMLSelectElement },
  ): void {
    const chosen = TIME_FORMATS.find(
      (format) => format === event.currentTarget.value,
    );
    if (chosen !== undefined) {
      timeFormat.choose(chosen);
    }
  }
</script>

<SectionHeading title={m.general_title()} />
<div class="mbs-pane-gap flex flex-col gap-pane-gap">
  <SettingRadios
    title={m.general_opens_on()}
    options={OPENING_PLACES}
    labels={PLACE_LABELS}
    hints={{ lastBook: m.general_opens_last_book_hint() }}
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
  <section
    aria-labelledby={datesId}
    class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row"
  >
    <h2 id={datesId} class="font-semibold">{m.general_dates_numbers()}</h2>
    <div class="flex flex-wrap items-center justify-between gap-sm">
      <label for={timeFormatId} class="font-medium">
        {m.general_time_format()}
      </label>
      <NativeSelect
        id={timeFormatId}
        value={timeFormat.choice}
        onchange={chooseTimeFormat}
        class="max-inline-full min-inline-none"
        fieldClass="min-inline-none inline-full"
      >
        {#each TIME_FORMATS as format (format)}
          <option value={format}>{TIME_FORMAT_LABELS[format]}</option>
        {/each}
      </NativeSelect>
    </div>
  </section>
</div>
