<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";

  import {
    LONG_PRESSES,
    type LongPressLength,
    touchChoices,
  } from "#lib/accessibility/touch-choices.svelte.ts";
  import {
    ANIMATION_GROUPS,
    getAnimationsSetting,
  } from "#lib/appearance/animations.svelte.ts";
  import { contrastChoice } from "#lib/page/contrast-choice.svelte.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { FLUSH_LIST_HEADING } from "#lib/settings/android-flush-look.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  const animations = getAnimationsSetting();
  const systemReducesMotion = new MediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const pageId = $props.id();
  const motionHeadingId = `${pageId}-motion`;
  const touchHeadingId = `${pageId}-touch`;
  const longPressId = `${pageId}-long-press`;
  const LONG_PRESS_NAMES = {
    short: m.accessibility_long_press_short,
    medium: m.accessibility_long_press_medium,
    long: m.accessibility_long_press_long,
  } satisfies Record<LongPressLength, () => string>;

  const isMotionReduced = $derived(
    systemReducesMotion.current ||
      ANIMATION_GROUPS.every((group) => !animations.isOn(group)),
  );

  function reduceMotion(isReduced: boolean): void {
    for (const group of ANIMATION_GROUPS) {
      animations.turn(group, !isReduced);
    }
  }
</script>

<SectionHeading title={m.accessibility_title()} />
<div class="mbs-pane-gap flex flex-col android:max-medium:mbs-none">
  <section aria-labelledby={motionHeadingId} class="flex flex-col">
    <h2 id={motionHeadingId} class={FLUSH_LIST_HEADING}>
      {m.accessibility_motion_and_contrast()}
    </h2>
    <SettingSwitch
      bleeds
      label={m.accessibility_reduce_motion()}
      description={m.accessibility_reduce_motion_help()}
      isOn={isMotionReduced}
      disabled={systemReducesMotion.current}
      onToggle={() => {
        reduceMotion(!isMotionReduced);
      }}
    />
    <SettingSwitch
      bleeds
      label={m.accessibility_higher_contrast()}
      description={m.accessibility_higher_contrast_help()}
      isOn={contrastChoice.isHigher}
      onToggle={() => {
        contrastChoice.choose(!contrastChoice.isHigher);
      }}
    />
  </section>
  <section aria-labelledby={touchHeadingId} class="flex flex-col">
    <h2 id={touchHeadingId} class={FLUSH_LIST_HEADING}>
      {m.accessibility_touch()}
    </h2>
    <SettingSwitch
      bleeds
      label={m.accessibility_larger_tap_targets()}
      isOn={touchChoices.hasLargerTargets}
      onToggle={() => {
        touchChoices.chooseLargerTargets(!touchChoices.hasLargerTargets);
      }}
    />
    <div class="flex flex-col gap-md px-lg py-sm">
      <span id={longPressId} class="text-body">
        {m.accessibility_long_press()}
      </span>
      <SegmentedControl
        options={LONG_PRESSES}
        labels={LONG_PRESS_NAMES}
        chosen={touchChoices.longPress}
        labelledBy={longPressId}
        isFullWidth
        onChoose={(length: LongPressLength) => {
          touchChoices.chooseLongPress(length);
        }}
      />
    </div>
  </section>
</div>
