<script lang="ts">
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import {
    newSeriesReadingMode,
    READING_MODE_CHOICES,
    type ReadingModeChoice,
  } from "#lib/reader/reading-direction.svelte.ts";
  import {
    readerDefaults,
    TAP_ZONES,
    type TapZones,
  } from "#lib/reader/reader-settings.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { hasVolumeKeys } from "#lib/reader/volume-keys.ts";
  import type { SwipeSide } from "#lib/series/swipe.ts";
  import {
    getSwipeActionsSetting,
    SWIPE_ACTIONS,
    type SwipeAction,
  } from "#lib/series/swipe-actions.svelte.ts";
  import SmartFeaturesSection from "#lib/reader/SmartFeaturesSection.svelte";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";
  import { getSkipUpNextSetting } from "#lib/up-next/skip-up-next.svelte.ts";

  const SWIPE_LABELS = {
    markRead: m.reading_swipe_mark_read,
    nothing: m.reading_swipe_nothing,
  } satisfies Record<SwipeAction, () => string>;
  const SWIPES = [
    { side: "towardEnd", label: m.reading_swipe_right },
    { side: "towardStart", label: m.reading_swipe_left },
  ] as const satisfies readonly { side: SwipeSide; label: () => string }[];

  const TAP_ZONE_LABELS = {
    edges: m.reader_tap_zones_edges,
    lShape: m.reader_tap_zones_l,
    off: m.reader_tap_zones_off,
  } satisfies Record<TapZones, () => string>;

  const defaults = readerDefaults();

  const skipUpNext = getSkipUpNextSetting();
  const swipeActions = getSwipeActionsSetting();
  const swipesId = $props.id();
  const tapZonesId = `${swipesId}-zones`;
  const modeId = `${swipesId}-mode`;
  const endId = `${swipesId}-end`;
  const MODE_NAMES = {
    automatic: m.reader_direction_automatic,
    leftToRight: m.reader_left_to_right,
    rightToLeft: m.reader_right_to_left,
    longStrip: m.reader_long_strip,
  } satisfies Record<ReadingModeChoice, () => string>;
  const newSeries = newSeriesReadingMode();

  function chooseNewSeriesMode(value: string): void {
    const choice = READING_MODE_CHOICES.find(
      (candidate) => candidate === value,
    );
    if (choice !== undefined) {
      newSeries.choose(choice);
    }
  }
</script>

<SectionHeading title={m.reading_title()} />
<div class="mbs-pane-gap flex flex-col gap-xl">
  <div class="flex flex-col gap-sm">
    <p class="text-detail text-muted">{m.reading_defaults_intro()}</p>
    <section
      class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row expanded:grid expanded:grid-cols-setting-grid expanded:items-center expanded:gap-x-md"
    >
      <label for={modeId} class="font-semibold">
        {m.reading_mode_new_series()}
      </label>
      <NativeSelect
        class="expanded:inline-setting-control"
        id={modeId}
        aria-describedby="{modeId}-help"
        value={newSeries.choice}
        onchange={(event: Event & { currentTarget: HTMLSelectElement }) => {
          chooseNewSeriesMode(event.currentTarget.value);
        }}
      >
        {#each READING_MODE_CHOICES as choice (choice)}
          <option value={choice}>{MODE_NAMES[choice]()}</option>
        {/each}
      </NativeSelect>
      <p id="{modeId}-help" class="col-span-full text-footnote text-muted">
        {m.reading_mode_new_series_help()}
      </p>
    </section>
  </div>
  <section
    aria-labelledby={tapZonesId}
    class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row"
  >
    <h2 id={tapZonesId} class="font-semibold">{m.reader_tap_zones()}</h2>
    <SegmentedControl
      options={TAP_ZONES}
      labels={TAP_ZONE_LABELS}
      chosen={defaults.look.tapZones}
      labelledBy={tapZonesId}
      isFullWidth
      onChoose={(zones: TapZones) => {
        defaults.change("tapZones", zones);
      }}
    />
    {#if hasVolumeKeys(currentPlatform())}
      <SettingSwitch
        label={m.reader_volume_keys()}
        description={m.reader_volume_keys_help()}
        isOn={defaults.look.turnsPagesWithVolumeKeys}
        onToggle={() => {
          defaults.change(
            "turnsPagesWithVolumeKeys",
            !defaults.look.turnsPagesWithVolumeKeys,
          );
        }}
        class="-mx-list-row inline-auto"
      />
    {/if}
    <SettingSwitch
      label={m.reader_keep_screen_on()}
      description={m.reading_keep_screen_on_help()}
      isOn={defaults.look.keepsScreenOn}
      onToggle={() => {
        defaults.change("keepsScreenOn", !defaults.look.keepsScreenOn);
      }}
      class="-mx-list-row inline-auto"
    />
  </section>
  <section
    aria-labelledby={endId}
    class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row"
  >
    <h2 id={endId} class="font-semibold">{m.reader_end_of_book()}</h2>
    <SettingSwitch
      label={m.reading_skip_up_next()}
      description={m.reading_skip_up_next_help()}
      isOn={skipUpNext.isOn}
      onToggle={() => {
        skipUpNext.turn(!skipUpNext.isOn);
      }}
      class="-mx-list-row inline-auto"
    />
  </section>
  <SmartFeaturesSection
    heading="h2"
    size="regular"
    class="rounded-card border border-border bg-card p-list-row"
  />
  <section
    aria-labelledby={swipesId}
    class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row"
  >
    <h2 id={swipesId} class="font-semibold">{m.reading_swipes()}</h2>
    <p id="{swipesId}-hint" class="text-footnote text-muted">
      {m.reading_swipes_help()}
    </p>
    {#each SWIPES as { side, label } (side)}
      <span id="{swipesId}-{side}" class="text-detail font-medium">
        {label()}
      </span>
      <SegmentedControl
        options={SWIPE_ACTIONS}
        labels={SWIPE_LABELS}
        chosen={swipeActions.actionFor(side)}
        labelledBy="{swipesId}-{side}"
        describedBy="{swipesId}-hint"
        size="small"
        onChoose={(action: SwipeAction) => {
          swipeActions.choose(side, action);
        }}
      />
    {/each}
  </section>
</div>
