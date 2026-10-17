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
    "flex items-center gap-md py-setting-grid-pad text-start text-small font-medium min-block-setting-grid-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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

<div class="flex flex-col divide-y divide-border">
  <SettingChoice
    isStacked
    label={m.reader_apply_to()}
    choices={[
      { value: "series", label: m.reader_this_series() },
      { value: "all", label: m.reader_all_series() },
    ]}
    chosen={settings.scope}
    onChoose={(scope: SettingsScope) => {
      settings.applyTo(scope);
    }}
  >
    <p class="text-caption text-muted expanded:hidden">
      {settings.scope === "series"
        ? m.reader_applies_to_series({ series: seriesTitle })
        : m.reader_applies_to_all()}
    </p>
  </SettingChoice>
  <div
    data-slot="setting-row"
    class="grid grid-cols-setting-grid items-center gap-x-md py-setting-grid-pad min-block-setting-grid-row"
  >
    <label for="{id}-mode" class="text-small font-medium">
      {m.reader_mode()}
    </label>
    <NativeSelect
      id="{id}-mode"
      class="inline-setting-control"
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
      {
        value: "one",
        label: m.reader_layout_one(),
        phoneLabel: m.reader_layout_one_page(),
      },
      {
        value: "two",
        label: m.reader_layout_two(),
        phoneLabel: m.reader_layout_two_pages(),
      },
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
  >
    <p class="text-caption text-muted expanded:hidden">
      {m.reader_fit_zoom_hint()}
    </p>
  </SettingChoice>
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
  <fieldset data-slot="setting-row" class="flex flex-col pbs-xl">
    <legend class="contents">
      <span class="text-small font-semibold">{m.reader_light_title()}</span>
    </legend>
    <LightSliders
      isInRows
      light={look.light}
      onChange={(light: ReaderLight) => {
        settings.change("light", light);
      }}
    />
  </fieldset>
  <Switch
    data-slot="setting-row"
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
    data-slot="setting-row"
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
