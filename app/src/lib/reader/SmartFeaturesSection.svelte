<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { androidListLook } from "#lib/settings/android-list-look.svelte.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    ANDROID_LIST_HEADING,
    FLUSH_BLEED,
    FLUSH_LIST_HEADING,
  } from "#lib/settings/android-flush-look.ts";
  import { DISABLED_ROW, TINTED } from "#lib/settings/setting-row-look.ts";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import {
    getSmartFeatures,
    type SmartFeature,
  } from "./smart-features.svelte.ts";

  type HeadingLevel = "h2" | "h3";
  type Size = "small" | "regular" | "flat";

  let {
    heading,
    size = "small",
    class: className,
  }: { heading: HeadingLevel; size?: Size; class?: ClassValue } = $props();

  type Look = Record<
    "section" | "heading" | "rows" | "label" | "description",
    string
  >;

  const SWITCH_ROW =
    "flex items-center gap-md py-setting-grid-pad text-start min-block-setting-grid-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  const FLUSH_ACTION_ROW = `${FLUSH_BLEED} flex items-center gap-lg ps-lg pe-xl py-sm text-start text-body min-block-native-row`;

  const LOOKS = {
    small: {
      section: "gap-sm",
      heading: "text-small font-semibold",
      rows: "divide-y divide-border",
      label: "text-small font-medium",
      description: "text-caption text-muted",
    },
    regular: {
      section: "gap-sm",
      heading: "font-semibold",
      rows: "divide-y divide-border",
      label: "font-medium expanded:font-semibold",
      description: "text-detail text-muted",
    },
    flat: {
      section: "",
      heading: ANDROID_LIST_HEADING,
      rows: "",
      label: "text-small font-medium",
      description: "text-caption text-muted",
    },
  } satisfies Record<Size, Look>;

  const FLUSH_LOOK = {
    section: "",
    heading: FLUSH_LIST_HEADING,
    rows: "",
    label: "tracking-native-row-title",
    description: "",
  } satisfies Look;

  const android = androidListLook();
  const isFlush = $derived(android.isOn && size === "regular");
  const look = $derived(isFlush ? FLUSH_LOOK : LOOKS[size]);

  const features = getSmartFeatures();
  const id = $props.id();
  const isIos = currentPlatform() === "ios";
  const allOff = $derived(features.areAllOff);
  const allOffRow = $derived(
    isFlush
      ? [FLUSH_ACTION_ROW, !allOff && TINTED, ROW_FOCUS_RING]
      : [
          SWITCH_ROW,
          "inline-full",
          allOff ? "text-muted" : isIos && "text-accent",
        ],
  );
  const fadesWhenAllOff = $derived(isFlush && allOff && DISABLED_ROW);
  const allOffIcon = $derived([!isIos && "text-muted", fadesWhenAllOff]);
  const allOffLabel = $derived([
    "flex-1 min-inline-none",
    look.label,
    fadesWhenAllOff,
  ]);

  const rows = $derived([
    {
      feature: "choosesReadingMode",
      label: m.reader_choose_mode(),
      description: m.reader_choose_mode_help(),
      isOn: features.choosesReadingMode,
      isDisabled: false,
    },
    {
      feature: "learnsReadingSpeed",
      label: m.reader_learn_speed(),
      description: m.reader_learn_speed_help(),
      isOn: features.learnsReadingSpeed,
      isDisabled: false,
    },
    {
      feature: "showsTimeLeft",
      label: m.reader_show_time_left(),
      description: features.learnsReadingSpeed
        ? m.reader_show_time_left_help()
        : m.reader_needs_learn_speed(),
      isOn: features.showsTimeLeft,
      isDisabled: !features.learnsReadingSpeed,
    },
    {
      feature: "showsBookSummary",
      label: m.reader_book_summary(),
      description: m.reader_book_summary_help(),
      isOn: features.showsBookSummary,
      isDisabled: false,
    },
    {
      feature: "autoScrollsAtMyPace",
      label: m.reader_auto_scroll_pace(),
      description: features.learnsReadingSpeed
        ? m.reader_auto_scroll_pace_help()
        : m.reader_needs_learn_speed(),
      isOn: features.autoScrollsAtMyPace,
      isDisabled: !features.learnsReadingSpeed,
    },
    {
      feature: "showsPagePreviews",
      label: m.reader_page_previews(),
      description: undefined,
      isOn: features.showsPagePreviews,
      isDisabled: false,
    },
  ] satisfies {
    feature: SmartFeature;
    label: string;
    description: string | undefined;
    isOn: boolean;
    isDisabled: boolean;
  }[]);
</script>

<section
  data-settings-group
  aria-labelledby="{id}-title"
  class={["flex flex-col", look.section, className]}
>
  <svelte:element this={heading} id="{id}-title" class={look.heading}>
    {m.reader_smart_features()}
  </svelte:element>
  <div class={["flex flex-col", look.rows]}>
    {#each rows as { feature, label, description, isOn, isDisabled } (feature)}
      {#if isFlush}
        <SettingSwitch
          {label}
          {description}
          {isOn}
          onToggle={() => {
            features.turn(feature, !isOn);
          }}
          disabled={isDisabled}
          bleeds
        />
      {:else}
        <Switch
          bind:checked={
            () => isOn,
            (turnedOn: boolean) => {
              features.turn(feature, turnedOn);
            }
          }
          disabled={isDisabled}
          aria-labelledby="{id}-{feature}"
          aria-describedby={description === undefined
            ? undefined
            : `${id}-${feature}-description`}
          class={[SWITCH_ROW, isDisabled && "text-muted"]}
        >
          <span class="flex flex-1 flex-col gap-2xs min-inline-none">
            <span id="{id}-{feature}" class={look.label}>{label}</span>
            {#if description !== undefined}
              <span id="{id}-{feature}-description" class={look.description}>
                {description}
              </span>
            {/if}
          </span>
        </Switch>
      {/if}
    {/each}
    <button
      type="button"
      class={allOffRow}
      disabled={allOff}
      onclick={() => {
        features.turnAllOff();
      }}
    >
      <Icon name="power" class={allOffIcon} />
      <span class={allOffLabel}>
        {allOff ? m.reader_smart_features_all_off() : m.reader_turn_all_off()}
      </span>
    </button>
  </div>
</section>
