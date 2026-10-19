<script lang="ts">
  import { Slider } from "#lib/components/ui/slider/index.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ApplyToChoice from "./ApplyToChoice.svelte";
  import { FASTEST_SPEED, SLOWEST_SPEED, SPEED_STEP } from "./auto-scroll.ts";
  import CropBordersSwitch from "./CropBordersSwitch.svelte";
  import KeepScreenOnSwitch from "./KeepScreenOnSwitch.svelte";
  import LightSliders from "./LightSliders.svelte";
  import type { SeriesReadingDirection } from "./reading-direction.svelte.ts";
  import ReadingModeSelect from "./ReadingModeSelect.svelte";
  import type {
    PageFit,
    PageLayout,
    PageTurnStyle,
    ReaderBackground,
    ReaderControlsLook,
    TapZones,
    TapToScroll,
    AutoScrollChoice,
    ReaderLight,
    ReaderSettings,
  } from "./reader-settings.svelte.ts";
  import SettingChoice from "./SettingChoice.svelte";
  import SkipUpNextSwitch from "./SkipUpNextSwitch.svelte";
  import { getSmartFeatures } from "./smart-features.svelte.ts";
  import SmartFeaturesSection from "./SmartFeaturesSection.svelte";

  let {
    settings,
    reading,
    seriesTitle,
    canUseMyPace,
  }: {
    settings: ReaderSettings;
    reading: SeriesReadingDirection;
    seriesTitle: string;
    canUseMyPace: boolean;
  } = $props();

  const autoScrollChoice = $derived(
    canUseMyPace ? settings.look.autoScrollSpeed : "set",
  );

  const isStrip = $derived(reading.mode === "longStrip");
  const features = getSmartFeatures();
  const id = $props.id();
  const look = $derived(settings.look);
</script>

{#if isStrip}
  <div class="flex flex-col divide-y divide-border">
    <section
      data-slot="setting-row"
      aria-labelledby="{id}-reading"
      class="flex flex-col border-be-0"
    >
      <h3 id="{id}-reading" class="text-small font-semibold">
        {m.reader_reading_title()}
      </h3>
      <div class="flex flex-col divide-y divide-border">
        <ApplyToChoice {settings} {seriesTitle} />
        <ReadingModeSelect {reading} />
        <SettingChoice
          isInline
          label={m.reader_tap_to_scroll()}
          choices={[
            { value: "topAndBottom", label: m.reader_tap_to_scroll_both() },
            { value: "off", label: m.reader_tap_zones_off() },
          ]}
          chosen={look.tapToScroll}
          onChoose={(tapToScroll: TapToScroll) => {
            settings.change("tapToScroll", tapToScroll);
          }}
        >
          <p class="col-span-full text-caption text-muted">
            {m.reader_tap_to_scroll_help()}
          </p>
        </SettingChoice>
      </div>
    </section>
    <section
      data-slot="setting-row"
      aria-labelledby="{id}-strip-screen"
      class="flex flex-col border-be-0 pbs-xl"
    >
      <h3 id="{id}-strip-screen" class="text-small font-semibold">
        {m.reader_screen_title()}
      </h3>
      <div class="flex flex-col divide-y divide-border">
        <CropBordersSwitch {settings} />
        <KeepScreenOnSwitch {settings} />
        <LightSliders
          isInRows
          showsWarmth={false}
          light={look.light}
          onChange={(light: ReaderLight) => {
            settings.change("light", light);
          }}
        />
      </div>
    </section>
    <section
      data-slot="setting-row"
      aria-labelledby="{id}-auto"
      class="flex flex-col border-be-0 pbs-xl"
    >
      <h3 id="{id}-auto" class="text-small font-semibold">
        {m.reader_auto_scroll()}
      </h3>
      <div class="flex flex-col divide-y divide-border">
        <SettingChoice
          isInline
          label={m.reader_auto_scroll_speed()}
          choices={[
            {
              value: "myPace",
              label: m.reader_auto_scroll_my_pace(),
              disabled: !canUseMyPace,
            },
            { value: "set", label: m.reader_auto_scroll_set_speed() },
          ]}
          chosen={autoScrollChoice}
          onChoose={(choice: AutoScrollChoice) => {
            settings.change("autoScrollSpeed", choice);
          }}
        >
          <p class="col-span-full text-caption text-muted">
            {m.reader_auto_scroll_help()}
          </p>
        </SettingChoice>
        {#if autoScrollChoice === "set"}
          <div
            class="grid grid-cols-setting-grid items-center gap-x-md py-setting-grid-pad min-block-setting-grid-row"
          >
            <p id="{id}-rate" class="text-small font-medium">
              {m.reader_auto_scroll_rate_value({
                count: look.pagesPerMinute,
              })}
            </p>
            <Slider
              aria-labelledby="{id}-rate"
              aria-label={m.reader_auto_scroll_rate()}
              class="inline-setting-control"
              min={SLOWEST_SPEED}
              max={FASTEST_SPEED}
              step={SPEED_STEP}
              bind:value={
                () => look.pagesPerMinute,
                (pages: number) => {
                  settings.change("pagesPerMinute", pages);
                }
              }
            />
          </div>
        {/if}
        <Switch
          bind:checked={
            () => look.pausesAtEnd,
            (isOn: boolean) => {
              settings.change("pausesAtEnd", isOn);
            }
          }
          class="flex items-center gap-md py-setting-grid-pad text-start text-small font-medium min-block-setting-grid-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span class="flex-1">{m.reader_pause_at_end()}</span>
        </Switch>
      </div>
    </section>
    <section
      data-slot="setting-row"
      aria-labelledby="{id}-strip-end"
      class="flex flex-col border-be-0 pbs-xl"
    >
      <h3 id="{id}-strip-end" class="text-small font-semibold">
        {m.reader_end_of_book()}
      </h3>
      <div class="flex flex-col divide-y divide-border">
        <Switch
          bind:checked={
            () => features.showsBookSummary,
            (isOn: boolean) => {
              features.turn("showsBookSummary", isOn);
            }
          }
          aria-labelledby="{id}-summary"
          aria-describedby="{id}-summary-description"
          class="flex items-center gap-md py-setting-grid-pad text-start min-block-setting-grid-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span class="flex flex-1 flex-col gap-2xs">
            <span id="{id}-summary" class="text-small font-medium">
              {m.reader_book_summary()}
            </span>
            <span id="{id}-summary-description" class="text-caption text-muted">
              {m.reader_book_summary_help()}
            </span>
          </span>
        </Switch>
        <SkipUpNextSwitch />
      </div>
    </section>
  </div>
{:else}
  <div class="flex flex-col divide-y divide-border">
    <ApplyToChoice {settings} {seriesTitle} />
    <ReadingModeSelect {reading} />
    <SettingChoice
      label={m.reader_layout()}
      choices={[
        { value: "automatic", label: m.reader_layout_automatic() },
        {
          value: "one",
          label: m.reader_layout_one(),
          phoneLabel: m.reader_layout_one_page(),
        },
        {
          value: "two",
          label: m.reader_layout_two(),
          phoneLabel: m.reader_layout_two_pages(),
        },
      ]}
      chosen={look.layout}
      onChoose={(layout: PageLayout) => {
        settings.change("layout", layout);
      }}
    />
    <SettingChoice
      label={m.reader_fit()}
      choices={[
        { value: "screen", label: m.reader_fit_screen() },
        { value: "width", label: m.reader_fit_width() },
        { value: "height", label: m.reader_fit_height_choice() },
      ]}
      chosen={look.fit}
      onChoose={(fit: PageFit) => {
        settings.change("fit", fit);
      }}
    >
      <p class="text-caption text-muted expanded:hidden">
        {m.reader_fit_zoom_hint()}
      </p>
    </SettingChoice>
    <SettingChoice
      label={m.reader_background()}
      choices={[
        { value: "black", label: m.reader_background_black() },
        { value: "grey", label: m.reader_background_grey() },
        { value: "white", label: m.reader_background_white() },
      ]}
      chosen={look.background}
      onChoose={(background: ReaderBackground) => {
        settings.change("background", background);
      }}
    />
    <SettingChoice
      label={m.reader_controls()}
      choices={[
        { value: "dark", label: m.reader_controls_dark() },
        { value: "matchApp", label: m.reader_controls_match() },
      ]}
      chosen={look.controls}
      onChoose={(controls: ReaderControlsLook) => {
        settings.change("controls", controls);
      }}
    />
    <section
      data-slot="setting-row"
      aria-labelledby="{id}-pages"
      class="flex flex-col border-be-0 pbs-xl"
    >
      <h3 id="{id}-pages" class="text-small font-semibold">
        {m.reader_pages_title()}
      </h3>
      <div class="flex flex-col divide-y divide-border">
        <SettingChoice
          isInline
          label={m.reader_tap_zones()}
          choices={[
            { value: "edges", label: m.reader_tap_zones_edges() },
            { value: "lShape", label: m.reader_tap_zones_l() },
            { value: "off", label: m.reader_tap_zones_off() },
          ]}
          chosen={look.tapZones}
          onChoose={(zones: TapZones) => {
            settings.change("tapZones", zones);
          }}
        />
        <SettingChoice
          isInline
          label={m.reader_page_turn()}
          choices={[
            { value: "instant", label: m.reader_page_turn_instant() },
            { value: "slide", label: m.reader_page_turn_slide() },
          ]}
          chosen={look.pageTurn}
          onChoose={(turn: PageTurnStyle) => {
            settings.change("pageTurn", turn);
          }}
        >
          <p class="col-span-full text-caption text-muted">
            {m.reader_page_turn_help()}
          </p>
        </SettingChoice>
      </div>
    </section>
    <fieldset data-slot="setting-row" class="flex flex-col border-be-0 pbs-xl">
      <legend class="contents">
        <span class="text-small font-semibold">{m.reader_light_title()}</span>
      </legend>
      <LightSliders
        isInRows
        light={look.light}
        onChange={(light: ReaderLight) => {
          settings.change("light", light);
        }}
      />
    </fieldset>
    <section
      data-slot="setting-row"
      aria-labelledby="{id}-screen"
      class="flex flex-col border-be-0 pbs-xl"
    >
      <h3 id="{id}-screen" class="text-small font-semibold">
        {m.reader_screen_title()}
      </h3>
      <div class="flex flex-col divide-y divide-border">
        <KeepScreenOnSwitch {settings} />
        <CropBordersSwitch {settings} />
      </div>
    </section>
    <section
      data-slot="setting-row"
      aria-labelledby="{id}-end"
      class="flex flex-col border-be-0 pbs-xl"
    >
      <h3 id="{id}-end" class="text-small font-semibold">
        {m.reader_end_of_book()}
      </h3>
      <SkipUpNextSwitch />
    </section>
    <SmartFeaturesSection heading="h3" class="pbs-xl" />
  </div>
{/if}
