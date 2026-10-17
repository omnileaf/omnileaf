<script lang="ts">
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import { m } from "#lib/paraglide/messages.js";

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

  let { reading }: { reading: SeriesReadingDirection } = $props();

  const id = $props.id();

  function automaticName(): string {
    return reading.mode === "longStrip"
      ? m.reader_direction_automatic_long_strip()
      : AUTOMATIC_NAMES[reading.direction]();
  }

  function choiceName(choice: ReadingModeChoice): string {
    return choice === "automatic" ? automaticName() : CHOSEN_NAMES[choice]();
  }

  function chooseDirection(value: string): void {
    const choice = READING_MODE_CHOICES.find(
      (candidate) => candidate === value,
    );
    if (choice !== undefined) {
      reading.choose(choice);
    }
  }
</script>

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
    onchange={(event: Event & { currentTarget: HTMLSelectElement }) => {
      chooseDirection(event.currentTarget.value);
    }}
  >
    {#each READING_MODE_CHOICES as choice (choice)}
      <option value={choice}>{choiceName(choice)}</option>
    {/each}
  </NativeSelect>
</div>
