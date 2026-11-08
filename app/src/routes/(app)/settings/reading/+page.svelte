<script lang="ts">
  import { CircleCheck } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import {
    newSeriesReadingMode,
    READING_MODE_CHOICES,
    type ReadingModeChoice,
  } from "#lib/reader/reading-direction.svelte.ts";
  import {
    READING_MODE_NAMES,
    TAP_ZONE_NAMES,
  } from "#lib/reader/reader-names.ts";
  import {
    readerDefaults,
    TAP_ZONES,
    type TapZones,
  } from "#lib/reader/reader-settings.svelte.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { readerHints } from "#lib/reader/reader-hints.svelte.ts";
  import { hasVolumeKeys } from "#lib/reader/volume-keys.ts";
  import type { SwipeSide } from "#lib/series/swipe.ts";
  import {
    getSwipeActionsSetting,
    SWIPE_ACTIONS,
    type SwipeAction,
  } from "#lib/series/swipe-actions.svelte.ts";
  import SmartFeaturesSection from "#lib/reader/SmartFeaturesSection.svelte";
  import {
    FLUSH_FOOTER,
    FLUSH_LIST_HEADING,
    FLUSH_NOTE,
  } from "#lib/settings/android-flush-look.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingActionRow from "#lib/settings/SettingActionRow.svelte";
  import SettingChoiceRow from "#lib/settings/SettingChoiceRow.svelte";
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

  const CARD_SWITCH = "-mx-list-row inline-auto";
  const CARD = "rounded-card border border-border bg-card p-list-row";

  const guideRows: Snippet = tapGuideRows;
  const switches: Snippet = deviceSwitches;
  const skipSwitch: Snippet = skipUpNextSwitch;

  const defaults = readerDefaults();
  const hints = readerHints();
  const notices = getNotices();
  const width = new WindowWidth();
  const android = new AndroidPhone();
  const isOnPhone = $derived(isPhone(currentPlatform(), width.current));

  const skipUpNext = getSkipUpNextSetting();
  const swipeActions = getSwipeActionsSetting();
  const swipesId = $props.id();
  const tapZonesId = `${swipesId}-zones`;
  const modeId = `${swipesId}-mode`;
  const endId = `${swipesId}-end`;
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

{#snippet tapGuideRows()}
  <SettingSwitch
    label={m.reading_tap_guide()}
    description={m.reading_tap_guide_help()}
    isOn={hints.showsTapGuide}
    onToggle={() => {
      hints.turnTapGuide(!hints.showsTapGuide);
    }}
    bleeds={android.isOn}
    class={android.isOn ? "" : CARD_SWITCH}
  />
  <SettingActionRow
    label={m.reading_guide_again()}
    description={m.reading_guide_again_help()}
    onPress={() => {
      hints.armReplay();
      notices.show({
        tone: "plain",
        icon: CircleCheck,
        title: m.reading_guide_again_done(),
      });
    }}
    class={android.isOn ? "" : CARD_SWITCH}
  />
{/snippet}

{#snippet deviceSwitches()}
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
      bleeds={android.isOn}
      class={android.isOn ? "" : CARD_SWITCH}
    />
  {/if}
  <SettingSwitch
    label={m.reader_keep_screen_on()}
    description={m.reading_keep_screen_on_help()}
    isOn={defaults.look.keepsScreenOn}
    onToggle={() => {
      defaults.change("keepsScreenOn", !defaults.look.keepsScreenOn);
    }}
    bleeds={android.isOn}
    class={android.isOn ? "" : CARD_SWITCH}
  />
  <SettingSwitch
    label={m.reading_resume_notice()}
    description={m.reading_resume_notice_help()}
    isOn={hints.showsResumeNotice(isOnPhone)}
    onToggle={() => {
      hints.turnResumeNotice(!hints.showsResumeNotice(isOnPhone));
    }}
    bleeds={android.isOn}
    class={android.isOn ? "" : CARD_SWITCH}
  />
{/snippet}

{#snippet skipUpNextSwitch()}
  <SettingSwitch
    label={m.reading_skip_up_next()}
    description={m.reading_skip_up_next_help()}
    isOn={skipUpNext.isOn}
    onToggle={() => {
      skipUpNext.turn(!skipUpNext.isOn);
    }}
    bleeds={android.isOn}
    class={android.isOn ? "" : CARD_SWITCH}
  />
{/snippet}

<SectionHeading title={m.reading_title()} />
<div
  class={[
    "mbs-pane-gap flex flex-col android:max-medium:mbs-none",
    !android.isOn && "gap-xl",
  ]}
>
  <div class={["flex flex-col", !android.isOn && "gap-sm"]}>
    <p class={android.isOn ? FLUSH_NOTE : "text-detail text-muted"}>
      {m.reading_defaults_intro()}
    </p>
    {#if android.isOn}
      <SettingChoiceRow
        title={m.reading_mode_new_series()}
        value={READING_MODE_NAMES[newSeries.choice]()}
        help={m.reading_mode_new_series_help()}
        choices={READING_MODE_CHOICES.map((choice) => ({
          value: choice,
          label: READING_MODE_NAMES[choice](),
        }))}
        chosen={newSeries.choice}
        onChoose={(choice: ReadingModeChoice) => {
          newSeries.choose(choice);
        }}
      />
    {:else}
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
            <option value={choice}>{READING_MODE_NAMES[choice]()}</option>
          {/each}
        </NativeSelect>
        <p id="{modeId}-help" class="col-span-full text-footnote text-muted">
          {m.reading_mode_new_series_help()}
        </p>
      </section>
    {/if}
  </div>
  {#if android.isOn}
    <div class="flex flex-col">
      <SettingChoiceRow
        title={m.reader_tap_zones()}
        value={TAP_ZONE_NAMES[defaults.look.tapZones]()}
        choices={TAP_ZONES.map((zones) => ({
          value: zones,
          label: TAP_ZONE_NAMES[zones](),
        }))}
        chosen={defaults.look.tapZones}
        onChoose={(zones: TapZones) => {
          defaults.change("tapZones", zones);
        }}
      />
      {@render guideRows()}
      {@render switches()}
    </div>
  {:else}
    <section
      aria-labelledby={tapZonesId}
      class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row"
    >
      <h2 id={tapZonesId} class="font-semibold">{m.reader_tap_zones()}</h2>
      <SegmentedControl
        options={TAP_ZONES}
        labels={TAP_ZONE_NAMES}
        chosen={defaults.look.tapZones}
        labelledBy={tapZonesId}
        isFullWidth
        onChoose={(zones: TapZones) => {
          defaults.change("tapZones", zones);
        }}
      />
      {@render guideRows()}
      {@render switches()}
    </section>
  {/if}
  {#if android.isOn}
    <div class="flex flex-col">
      <h2 id={endId} class={FLUSH_LIST_HEADING}>{m.reader_end_of_book()}</h2>
      {@render skipSwitch()}
    </div>
  {:else}
    <section
      aria-labelledby={endId}
      class="flex flex-col gap-sm rounded-card border border-border bg-card p-list-row"
    >
      <h2 id={endId} class="font-semibold">{m.reader_end_of_book()}</h2>
      {@render skipSwitch()}
    </section>
  {/if}
  <SmartFeaturesSection
    heading="h2"
    size="regular"
    class={android.isOn ? "" : CARD}
  />
  {#if android.isOn}
    <div class="flex flex-col">
      <h2 id={swipesId} class={FLUSH_LIST_HEADING}>{m.reading_swipes()}</h2>
      {#each SWIPES as { side, label } (side)}
        <SettingChoiceRow
          title={label()}
          value={SWIPE_LABELS[swipeActions.actionFor(side)]()}
          choices={SWIPE_ACTIONS.map((action) => ({
            value: action,
            label: SWIPE_LABELS[action](),
          }))}
          chosen={swipeActions.actionFor(side)}
          onChoose={(action: SwipeAction) => {
            swipeActions.choose(side, action);
          }}
        />
      {/each}
      <p class={FLUSH_FOOTER}>{m.reading_swipes_help()}</p>
    </div>
  {:else}
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
  {/if}
</div>
