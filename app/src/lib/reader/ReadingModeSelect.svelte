<script lang="ts">
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import { OutlinedSelect } from "#lib/components/ui/outlined-field/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { ANDROID_SHEET_BLEED } from "#lib/settings/android-flush-look.ts";
  import SettingChoiceRow from "#lib/settings/SettingChoiceRow.svelte";

  import type { ModeField } from "./reading-settings-content-look.ts";
  import {
    READING_MODE_CHOICES,
    type ReadingModeChoice,
    type SeriesReadingDirection,
  } from "./reading-direction.svelte.ts";

  const CHOSEN_NAMES = {
    leftToRight: m.reader_left_to_right,
    rightToLeft: m.reader_right_to_left,
    longStrip: m.reader_long_strip,
  } as const;
  const AUTOMATIC_NAMES = {
    leftToRight: m.reader_direction_automatic_left_to_right,
    rightToLeft: m.reader_direction_automatic_right_to_left,
  } as const;

  let {
    reading,
    field,
  }: { reading: SeriesReadingDirection; field: ModeField } = $props();

  const id = $props.id();

  function automaticName(): string {
    return reading.mode === "longStrip"
      ? m.reader_direction_automatic_long_strip()
      : AUTOMATIC_NAMES[reading.direction]();
  }

  function choiceName(choice: ReadingModeChoice): string {
    return choice === "automatic" ? automaticName() : CHOSEN_NAMES[choice]();
  }

  const modes = $derived(
    READING_MODE_CHOICES.map((choice) => ({
      value: choice,
      label: choiceName(choice),
    })),
  );

  function chooseDirection({
    currentTarget: { value },
  }: Event & { currentTarget: HTMLSelectElement }) {
    const choice = READING_MODE_CHOICES.find(
      (candidate) => candidate === value,
    );
    if (choice !== undefined) {
      reading.choose(choice);
    }
  }
</script>

{#if field === "row"}
  <SettingChoiceRow
    data-reading-mode
    title={m.reader_mode()}
    value={choiceName(reading.choice)}
    choices={modes}
    chosen={reading.choice}
    bleed={ANDROID_SHEET_BLEED}
    onChoose={(choice: ReadingModeChoice) => {
      reading.choose(choice);
    }}
  />
{:else if field === "outlined"}
  <div data-slot="setting-row" class="py-md">
    <OutlinedSelect
      data-reading-mode
      label={m.reader_mode()}
      labelClass="bg-native-sheet"
      value={reading.choice}
      onchange={chooseDirection}
    >
      {#each modes as mode (mode.value)}
        <option value={mode.value}>{mode.label}</option>
      {/each}
    </OutlinedSelect>
  </div>
{:else}
  <div
    data-slot="setting-row"
    class="grid grid-cols-setting-grid items-center gap-x-md py-setting-grid-pad min-block-setting-grid-row"
  >
    <label for="{id}-mode" class="text-small font-medium">
      {m.reader_mode()}
    </label>
    <NativeSelect
      data-reading-mode
      id="{id}-mode"
      class="inline-setting-control"
      value={reading.choice}
      onchange={chooseDirection}
    >
      {#each modes as mode (mode.value)}
        <option value={mode.value}>{mode.label}</option>
      {/each}
    </NativeSelect>
  </div>
{/if}
