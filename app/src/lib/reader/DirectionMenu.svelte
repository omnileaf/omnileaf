<script lang="ts">
  import { ArrowLeftRight } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";

  import {
    DropdownMenuContent,
    DropdownMenuRadioItem,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    QUICK_SETTING_ICON_SIZE,
    QUICK_SETTING_LOOK,
  } from "#lib/reader/quick-setting.ts";
  import {
    DIRECTION_CHOICES,
    type DirectionChoice,
    type SeriesReadingDirection,
  } from "#lib/reader/reading-direction.svelte.ts";

  const CHOICE_NAMES = {
    automatic: m.reader_direction_automatic,
    leftToRight: m.reader_left_to_right,
    rightToLeft: m.reader_right_to_left,
  } satisfies Record<DirectionChoice, () => string>;

  let {
    reading,
    onOpenChange,
  }: {
    reading: SeriesReadingDirection;
    onOpenChange: (isOpen: boolean) => void;
  } = $props();

  function choose(value: string): void {
    const choice = DIRECTION_CHOICES.find((candidate) => candidate === value);
    if (choice !== undefined) {
      reading.choose(choice);
    }
  }
</script>

<DropdownMenu.Root {onOpenChange}>
  <DropdownMenu.Trigger
    class={[
      QUICK_SETTING_LOOK,
      reading.direction === "rightToLeft"
        ? "bg-reader-lit text-on-reader-lit"
        : "hover:tint-reader-hover active:tint-reader-pressed",
    ]}
  >
    <ArrowLeftRight
      size={QUICK_SETTING_ICON_SIZE}
      aria-hidden="true"
      class="shrink-0"
    />
    <span class="flex items-center gap-xs">
      {CHOICE_NAMES[reading.direction]()}
      {#if reading.isDetected}
        <span
          class="rounded-full bg-reader-lit px-xs text-reader-thumbnail font-bold tracking-overline text-reader-accent uppercase"
          >{m.reader_direction_auto()}</span
        >
      {/if}
    </span>
  </DropdownMenu.Trigger>
  <DropdownMenuContent aria-label={m.reader_direction()}>
    <DropdownMenu.RadioGroup value={reading.choice} onValueChange={choose}>
      {#each DIRECTION_CHOICES as choice (choice)}
        <DropdownMenuRadioItem value={choice}
          >{CHOICE_NAMES[choice]()}</DropdownMenuRadioItem
        >
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenuContent>
</DropdownMenu.Root>
