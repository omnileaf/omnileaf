<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    getSmartFeatures,
    type SmartFeature,
  } from "./smart-features.svelte.ts";

  type HeadingLevel = "h2" | "h3";

  let {
    heading,
    class: className,
  }: { heading: HeadingLevel; class?: ClassValue } = $props();

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
  class={["flex flex-col gap-sm", className]}
>
  <svelte:element
    this={heading}
    id="{id}-title"
    class="text-small font-semibold"
  >
    {m.reader_smart_features()}
  </svelte:element>
  <div class="flex flex-col divide-y divide-border">
    {#each rows as { feature, label, description, isOn, isDisabled } (feature)}
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
        <span class="flex flex-1 flex-col gap-2xs">
          <span id="{id}-{feature}" class="text-small font-medium">{label}</span
          >
          {#if description !== undefined}
            <span
              id="{id}-{feature}-description"
              class="text-caption text-muted">{description}</span
            >
          {/if}
        </span>
      </Switch>
    {/each}
  </div>
  <Button
    type="button"
    look="chip"
    class="self-start px-lg min-block-touch-target expanded:min-block-pointer-button"
    onclick={() => {
      features.turnAllOff();
    }}
  >
    {m.reader_turn_all_off()}
  </Button>
</section>
