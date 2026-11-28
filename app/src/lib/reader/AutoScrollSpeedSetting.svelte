<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Slider } from "#lib/components/ui/slider/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    type ReaderSettings,
    SCREENS_PER_MINUTE,
    type SettingsScope,
  } from "./reader-settings.svelte.ts";
  import SettingChoice from "./SettingChoice.svelte";
  import type { SettingChoiceControl } from "./setting-choice-control.ts";

  let {
    settings,
    seriesTitle,
    control,
  }: {
    settings: ReaderSettings;
    seriesTitle: string;
    control: SettingChoiceControl;
  } = $props();

  const id = $props.id();

  const range = {
    slowest: SCREENS_PER_MINUTE.slowest,
    fastest: SCREENS_PER_MINUTE.fastest,
  };
</script>

<div
  class="grid grid-cols-setting-grid items-center gap-x-md py-setting-grid-pad min-block-setting-grid-row"
>
  <p id="{id}-rate" class="text-small font-medium">
    {m.reader_auto_scroll_rate_value({ count: settings.speed })}
  </p>
  <Slider
    aria-labelledby="{id}-rate"
    aria-label={m.reader_auto_scroll_rate()}
    class="inline-setting-control"
    min={SCREENS_PER_MINUTE.slowest}
    max={SCREENS_PER_MINUTE.fastest}
    step={SCREENS_PER_MINUTE.step}
    bind:value={
      () => settings.speed,
      (screens: number) => {
        settings.changeSpeed(screens);
      }
    }
  />
</div>
<SettingChoice
  isStacked
  {control}
  label={m.reader_save_speed_for()}
  choices={[
    { value: "series", label: m.reader_this_series() },
    { value: "all", label: m.reader_all_series() },
  ]}
  chosen={settings.speedSavedFor}
  onChoose={(scope: SettingsScope) => {
    settings.saveSpeedFor(scope);
  }}
>
  <p class="text-caption text-muted">
    {settings.speedSavedFor === "series"
      ? m.reader_speed_saved_for_series({ series: seriesTitle, ...range })
      : m.reader_speed_saved_for_all(range)}
  </p>
</SettingChoice>
<Button
  type="button"
  variant="plain"
  class="self-start"
  onclick={() => {
    settings.useDefaultSpeed();
  }}
>
  {m.reader_use_default_speed({ count: settings.defaultSpeed })}
</Button>
