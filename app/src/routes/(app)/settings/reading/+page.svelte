<script lang="ts">
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import {
    readerDefaults,
    TAP_ZONES,
    type TapZones,
  } from "#lib/reader/reader-settings.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { SwipeSide } from "#lib/series/swipe.ts";
  import {
    getSwipeActionsSetting,
    SWIPE_ACTIONS,
    type SwipeAction,
  } from "#lib/series/swipe-actions.svelte.ts";
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
</script>

<SectionHeading title={m.reading_title()} />
<div class="mbs-pane-gap flex flex-col gap-pane-gap">
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
      onChoose={(zones: TapZones) => {
        defaults.change("tapZones", zones);
      }}
    />
  </section>
  <SettingSwitch
    label={m.reading_skip_up_next()}
    description={m.reading_skip_up_next_help()}
    isOn={skipUpNext.isOn}
    onToggle={() => {
      skipUpNext.turn(!skipUpNext.isOn);
    }}
    class="rounded-card border border-border bg-card"
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
