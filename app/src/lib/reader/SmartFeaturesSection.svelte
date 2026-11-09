<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    ANDROID_LIST_HEADING,
    FLUSH_LIST_HEADING,
  } from "#lib/settings/android-flush-look.ts";
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
    "section" | "heading" | "rows" | "label" | "description" | "action",
    string
  >;

  const POINTER_ACTION =
    "self-start px-lg min-block-touch-target expanded:min-block-pointer-button";

  const LOOKS = {
    small: {
      section: "gap-sm",
      heading: "text-small font-semibold",
      rows: "divide-y divide-border",
      label: "text-small font-medium",
      description: "text-caption text-muted",
      action: POINTER_ACTION,
    },
    regular: {
      section: "gap-sm",
      heading: "font-semibold",
      rows: "divide-y divide-border",
      label: "font-medium expanded:font-semibold",
      description: "text-detail text-muted",
      action: POINTER_ACTION,
    },
    flat: {
      section: "",
      heading: ANDROID_LIST_HEADING,
      rows: "",
      label: "text-small font-medium",
      description: "text-caption text-muted",
      action: POINTER_ACTION,
    },
  } satisfies Record<Size, Look>;

  const FLUSH_LOOK = {
    section: "",
    heading: FLUSH_LIST_HEADING,
    rows: "",
    label: "",
    description: "",
    action: "mx-lg my-sm self-start px-lg min-block-touch-target",
  } satisfies Look;

  const android = new AndroidPhone();
  const isFlush = $derived(android.isOn && size === "regular");
  const look = $derived(isFlush ? FLUSH_LOOK : LOOKS[size]);

  const features = getSmartFeatures();
  const id = $props.id();

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
          class={[
            "flex items-center gap-md py-setting-grid-pad text-start min-block-setting-grid-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            isDisabled && "text-muted",
          ]}
        >
          <span class="flex flex-1 flex-col gap-2xs min-inline-none">
            <span id="{id}-{feature}" class={look.label}>{label}</span>
            {#if description !== undefined}
              <span id="{id}-{feature}-description" class={look.description}
                >{description}</span
              >
            {/if}
          </span>
        </Switch>
      {/if}
    {/each}
  </div>
  <Button
    type="button"
    look="chip"
    class={look.action}
    onclick={() => {
      features.turnAllOff();
    }}
  >
    {m.reader_turn_all_off()}
  </Button>
</section>
