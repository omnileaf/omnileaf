<script lang="ts">
  import {
    ArrowLeft,
    ArrowLeftRight,
    ArrowRight,
    ChevronDown,
    Scan,
  } from "@lucide/svelte";
  import { DropdownMenu } from "bits-ui";

  import {
    DropdownMenuContent,
    DropdownMenuRadioItem,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    QUICK_SETTING_ICON_SIZE,
    QUICK_SETTING_LIT,
    QUICK_SETTING_LOOK,
  } from "#lib/reader/quick-setting.ts";
  import {
    DIRECTION_CHOICES,
    type DirectionChoice,
    type SeriesReadingDirection,
  } from "#lib/reader/reading-direction.svelte.ts";

  const DIRECTION_NAMES = {
    leftToRight: m.reader_left_to_right,
    rightToLeft: m.reader_right_to_left,
  } as const;
  const AUTOMATIC_NAMES = {
    leftToRight: m.reader_direction_automatic_left_to_right,
    rightToLeft: m.reader_direction_automatic_right_to_left,
  } as const;
  const CHOICE_ICONS = {
    automatic: Scan,
    leftToRight: ArrowRight,
    rightToLeft: ArrowLeft,
  } as const;

  let {
    reading,
    seriesTitle,
    onOpenChange,
  }: {
    reading: SeriesReadingDirection;
    seriesTitle: string;
    onOpenChange: (isOpen: boolean) => void;
  } = $props();

  const isAutomatic = $derived(reading.choice === "automatic");

  function choiceName(choice: DirectionChoice): string {
    return choice === "automatic"
      ? AUTOMATIC_NAMES[reading.direction]()
      : DIRECTION_NAMES[choice]();
  }

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
      reading.direction === "rightToLeft" && QUICK_SETTING_LIT,
    ]}
  >
    <ArrowLeftRight
      size={QUICK_SETTING_ICON_SIZE}
      aria-hidden="true"
      class="shrink-0"
    />
    <span class="grid">
      {#each ["leftToRight", "rightToLeft"] as const as shown (shown)}
        <span
          class={[
            "col-start-1 row-start-1",
            reading.direction !== shown && "invisible",
          ]}
          aria-hidden={reading.direction !== shown}
        >
          {DIRECTION_NAMES[shown]()}
        </span>
      {/each}
    </span>
    <span
      class={[
        "rounded-shadcn-control border border-border px-xs text-caption font-medium",
        !isAutomatic && "invisible",
      ]}
      aria-hidden={!isAutomatic}
    >
      {m.reader_direction_auto()}
    </span>
    <ChevronDown
      size={QUICK_SETTING_ICON_SIZE}
      aria-hidden="true"
      class="hidden shrink-0 opacity-50 expanded:block"
    />
  </DropdownMenu.Trigger>
  <DropdownMenuContent to="main" aria-label={m.reader_direction()}>
    <p class="px-sm py-icon-gap text-caption font-medium text-muted">
      {m.reader_direction()}
    </p>
    <DropdownMenu.RadioGroup value={reading.choice} onValueChange={choose}>
      {#each DIRECTION_CHOICES as choice (choice)}
        {@const Icon = CHOICE_ICONS[choice]}
        <DropdownMenuRadioItem value={choice}>
          <span class="flex items-center gap-sm">
            <Icon size={QUICK_SETTING_ICON_SIZE} aria-hidden="true" />
            {choiceName(choice)}
          </span>
        </DropdownMenuRadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
    <DropdownMenu.Separator class="-mx-xs my-xs border-bs border-border" />
    <p class="px-sm py-icon-gap text-caption text-muted max-inline-reader-note">
      {reading.isDetected
        ? m.reader_direction_found({ series: seriesTitle })
        : m.reader_direction_remembered({ series: seriesTitle })}
    </p>
  </DropdownMenuContent>
</DropdownMenu.Root>
