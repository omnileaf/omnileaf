<script lang="ts">
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import LightSliders from "./LightSliders.svelte";
  import {
    DIRECTION_CHOICES,
    type DirectionChoice,
    type SeriesReadingDirection,
  } from "./reading-direction.svelte.ts";
  import type {
    PageFit,
    PageLayout,
    ReaderBackground,
    ReaderControlsLook,
    ReaderLight,
    ReaderSettings,
    SettingsScope,
  } from "./reader-settings.svelte.ts";
  import SettingChoice from "./SettingChoice.svelte";

  const DIRECTION_NAMES = {
    leftToRight: m.reader_left_to_right,
    rightToLeft: m.reader_right_to_left,
  } as const;
  const AUTOMATIC_NAMES = {
    leftToRight: m.reader_direction_automatic_left_to_right,
    rightToLeft: m.reader_direction_automatic_right_to_left,
  } as const;
  const SWITCH_ROW =
    "flex items-center gap-md rounded-control py-sm text-start text-small font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  let {
    settings,
    reading,
    seriesTitle,
  }: {
    settings: ReaderSettings;
    reading: SeriesReadingDirection;
    seriesTitle: string;
  } = $props();

  const id = $props.id();
  const look = $derived(settings.look);

  function choiceName(choice: DirectionChoice): string {
    return choice === "automatic"
      ? AUTOMATIC_NAMES[reading.direction]()
      : DIRECTION_NAMES[choice]();
  }

  function chooseDirection(value: string): void {
    const choice = DIRECTION_CHOICES.find((candidate) => candidate === value);
    if (choice !== undefined) {
      reading.choose(choice);
    }
  }
</script>

<div class="flex flex-col gap-lg">
  <SettingChoice
    label={m.reader_apply_to()}
    choices={[
      { value: "series", label: m.reader_this_series() },
      { value: "all", label: m.reader_all_series() },
    ]}
    chosen={settings.scope}
    onChoose={(scope: SettingsScope) => {
      settings.applyTo(scope);
    }}
  />
  <p class="-mbs-sm text-caption text-muted">
    {settings.scope === "series"
      ? m.reader_applies_to_series({ series: seriesTitle })
      : m.reader_applies_to_all()}
  </p>
  <div
    class="flex flex-col gap-sm expanded:grid expanded:grid-cols-setting-row expanded:items-center expanded:gap-md"
  >
    <label for="{id}-mode" class="text-small font-medium">
      {m.reader_mode()}
    </label>
    <NativeSelect
      id="{id}-mode"
      value={reading.choice}
      onchange={(event: Event & { currentTarget: HTMLSelectElement }) => {
        chooseDirection(event.currentTarget.value);
      }}
    >
      {#each DIRECTION_CHOICES as choice (choice)}
        <option value={choice}>{choiceName(choice)}</option>
      {/each}
    </NativeSelect>
  </div>
  <SettingChoice
    label={m.reader_layout()}
    choices={[
      { value: "automatic", label: m.reader_layout_automatic() },
      { value: "one", label: m.reader_layout_one() },
      { value: "two", label: m.reader_layout_two() },
    ]}
    chosen={look.layout}
    onChoose={(layout: PageLayout) => {
      settings.change("layout", layout);
    }}
  />
  <SettingChoice
    label={m.reader_fit()}
    choices={[
      { value: "screen", label: m.reader_fit_screen() },
      { value: "width", label: m.reader_fit_width() },
      { value: "height", label: m.reader_fit_height_choice() },
    ]}
    chosen={look.fit}
    onChoose={(fit: PageFit) => {
      settings.change("fit", fit);
    }}
  />
  <SettingChoice
    label={m.reader_background()}
    choices={[
      { value: "black", label: m.reader_background_black() },
      { value: "grey", label: m.reader_background_grey() },
      { value: "white", label: m.reader_background_white() },
    ]}
    chosen={look.background}
    onChoose={(background: ReaderBackground) => {
      settings.change("background", background);
    }}
  />
  <SettingChoice
    label={m.reader_controls()}
    choices={[
      { value: "dark", label: m.reader_controls_dark() },
      { value: "matchApp", label: m.reader_controls_match() },
    ]}
    chosen={look.controls}
    onChoose={(controls: ReaderControlsLook) => {
      settings.change("controls", controls);
    }}
  />
  <hr class="border-border" />
  <fieldset class="flex flex-col gap-md">
    <legend class="mbe-md text-small font-semibold">
      {m.reader_light_title()}
    </legend>
    <LightSliders
      isInRows
      light={look.light}
      onChange={(light: ReaderLight) => {
        settings.change("light", light);
      }}
    />
  </fieldset>
  <hr class="border-border" />
  <Switch
    bind:checked={
      () => look.keepsScreenOn,
      (isOn: boolean) => {
        settings.change("keepsScreenOn", isOn);
      }
    }
    class={SWITCH_ROW}
  >
    <span class="flex-1">{m.reader_keep_screen_on()}</span>
  </Switch>
  <Switch
    disabled
    bind:checked={
      () => look.cropsBorders,
      (isOn: boolean) => {
        settings.change("cropsBorders", isOn);
      }
    }
    class={[SWITCH_ROW, "text-muted"]}
  >
    <span class="flex-1">
      {m.reader_coming_soon({ feature: m.reader_crop_borders() })}
    </span>
  </Switch>
</div>
