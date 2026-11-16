<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";

  import { boldTextChoice } from "#lib/accessibility/bold-text-choice.svelte.ts";
  import {
    TEXT_SIZES,
    type TextSize,
    textSizeChoice,
  } from "#lib/accessibility/text-size-choice.svelte.ts";
  import {
    LONG_PRESSES,
    type LongPressLength,
    touchChoices,
  } from "#lib/accessibility/touch-choices.svelte.ts";
  import {
    ANIMATION_GROUPS,
    getAnimationsSetting,
  } from "#lib/appearance/animations.svelte.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import {
    Item,
    ItemChevron,
    ItemContent,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { contrastChoice } from "#lib/page/contrast-choice.svelte.ts";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import {
    FLUSH_LIST,
    FLUSH_LIST_HEADING,
    FLUSH_STACKED_ROW,
  } from "#lib/settings/android-flush-look.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";
  import SettingWords from "#lib/settings/SettingWords.svelte";
  import { openSettingsOrWarn } from "#lib/settings/open-settings.ts";

  const animations = getAnimationsSetting();
  const notices = getNotices();
  const systemReducesMotion = new MediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const pageId = $props.id();
  const textHeadingId = `${pageId}-text`;
  const textSizeId = `${pageId}-text-size`;
  const motionHeadingId = `${pageId}-motion`;
  const touchHeadingId = `${pageId}-touch`;
  const longPressId = `${pageId}-long-press`;
  const TEXT_SIZE_NAMES = {
    system: m.accessibility_text_size_system,
    larger: m.accessibility_text_size_larger,
    largest: m.accessibility_text_size_largest,
  } satisfies Record<TextSize, () => string>;
  const LONG_PRESS_NAMES = {
    short: m.accessibility_long_press_short,
    medium: m.accessibility_long_press_medium,
    long: m.accessibility_long_press_long,
  } satisfies Record<LongPressLength, () => string>;

  const isMotionReduced = $derived(
    systemReducesMotion.current ||
      ANIMATION_GROUPS.every((group) => !animations.isOn(group)),
  );

  function openAndroidSettings(): Promise<void> {
    return openSettingsOrWarn(
      commands.openAccessibilitySettings,
      notices,
      m.accessibility_open_android_settings_failed(),
    );
  }

  function reduceMotion(isReduced: boolean): void {
    for (const group of ANIMATION_GROUPS) {
      animations.turn(group, !isReduced);
    }
  }
</script>

<SectionHeading title={m.accessibility_title()} />
<div class="mbs-pane-gap flex flex-col android:max-medium:mbs-none">
  <section aria-labelledby={textHeadingId} class="flex flex-col">
    <h2 id={textHeadingId} class={FLUSH_LIST_HEADING}>
      {m.accessibility_text()}
    </h2>
    <div class={FLUSH_STACKED_ROW}>
      <SettingWords
        id={textSizeId}
        look="android"
        label={m.accessibility_text_size()}
        description={m.accessibility_text_size_help()}
      />
      <SegmentedControl
        options={TEXT_SIZES}
        labels={TEXT_SIZE_NAMES}
        chosen={textSizeChoice.size}
        labelledBy="{textSizeId}-label"
        describedBy="{textSizeId}-description"
        isFullWidth
        onChoose={(size: TextSize) => {
          textSizeChoice.choose(size);
        }}
      />
    </div>
    <SettingSwitch
      bleeds
      label={m.accessibility_bold_text()}
      description={m.accessibility_bold_text_help()}
      isOn={boldTextChoice.isBold}
      onToggle={() => {
        boldTextChoice.choose(!boldTextChoice.isBold);
      }}
    />
  </section>
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
    <div class={FLUSH_STACKED_ROW}>
      <SettingWords
        id={longPressId}
        look="android"
        label={m.accessibility_long_press()}
        description={undefined}
      />
      <SegmentedControl
        options={LONG_PRESSES}
        labels={LONG_PRESS_NAMES}
        chosen={touchChoices.longPress}
        labelledBy="{longPressId}-label"
        isFullWidth
        onChoose={(length: LongPressLength) => {
          touchChoices.chooseLongPress(length);
        }}
      />
    </div>
  </section>
  <ul class={FLUSH_LIST}>
    <li>
      <Item look="row" class={ROW_FOCUS_RING}>
        {#snippet child({ props })}
          <button type="button" {...props} onclick={openAndroidSettings}>
            <Icon name="external-link" class="shrink-0" />
            <ItemContent>
              <ItemTitle>{m.accessibility_open_android_settings()}</ItemTitle>
            </ItemContent>
            <ItemChevron shownOn="everywhere" />
          </button>
        {/snippet}
      </Item>
    </li>
  </ul>
</div>
