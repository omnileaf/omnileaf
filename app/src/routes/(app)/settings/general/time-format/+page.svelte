<script lang="ts">
  import { Check } from "@lucide/svelte";

  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";
  import {
    getTimeFormatSetting,
    TIME_FORMATS,
    type TimeFormat,
  } from "#lib/general/time-format.svelte.ts";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import { m } from "#lib/paraglide/messages.js";

  const CHECK_SIZE = 22;
  const CHECK_STROKE = 2.4;

  const timeFormat = getTimeFormatSetting();
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
</script>

<GroupedGround>
  <SectionHeading
    title={m.general_time_format()}
    parent={{ route: "/(app)/settings/general", title: m.general_title() }}
  />
  <div class="mbs-pane-gap flex flex-col gap-sm">
    <RadioGroup
      options={TIME_FORMATS}
      chosen={timeFormat.choice}
      onChoose={(choice: TimeFormat) => {
        timeFormat.choose(choice);
      }}
      aria-label={m.general_time_format()}
      class={[
        "flex flex-col divide-y divide-border rounded-list border border-border bg-card",
        GROUP_PLATE,
      ]}
    >
      {#each TIME_FORMATS as choice (choice)}
        {@const isChosen = timeFormat.choice === choice}
        <RadioGroupItem
          value={choice}
          class={[
            "flex items-center gap-md py-xs ps-lg pe-list-row text-start transition-control inline-full min-block-phone-row hover:bg-hover focus-visible:-outline-offset-2 active:bg-pressed",
            isChosen ? "font-semibold" : "font-medium",
          ]}
        >
          <span class="flex flex-1 flex-col gap-2xs">
            <span>{TIME_FORMAT_LABELS[choice]}</span>
          </span>
          {#if isChosen}
            <Check
              size={CHECK_SIZE}
              strokeWidth={CHECK_STROKE}
              class="shrink-0 text-accent"
            />
          {/if}
        </RadioGroupItem>
      {/each}
    </RadioGroup>
  </div>
</GroupedGround>
