<script lang="ts">
  import { Command } from "bits-ui";

  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { Place } from "./places";
  import { type Choice, choiceKey } from "./quick-open-choice";

  const PLACE_ICON_SIZE = 16;

  let {
    id,
    choice,
    isActive,
    usesStandIns,
    onChoose,
  }: {
    id: string;
    choice: Choice;
    isActive: boolean;
    usesStandIns: boolean;
    onChoose: () => void;
  } = $props();

  const lookOf = $derived(usesStandIns ? standInLook : realLook);
  const PlaceIcon: Place["icon"] | undefined = $derived(
    choice.kind === "place" ? choice.place.icon : undefined,
  );
</script>

<Command.Item
  {id}
  value={choiceKey(choice)}
  class={[
    "flex cursor-default items-center gap-md rounded-field px-option-inline py-xs min-block-quick-open-option",
    isActive && "bg-accent-soft",
  ]}
  onSelect={onChoose}
>
  {#if choice.kind === "series"}
    <span
      class="relative aspect-cover shrink-0 overflow-hidden rounded-quick-open-cover bg-chip inline-quick-open-cover"
    >
      <CoverImage cover={lookOf(choice.series).cover} {coverUrl} />
    </span>
  {:else if PlaceIcon !== undefined}
    <span
      class="flex shrink-0 items-center justify-center rounded-control bg-chip block-option-icon inline-option-icon"
    >
      <PlaceIcon size={PLACE_ICON_SIZE} aria-hidden="true" />
    </span>
  {/if}
  <span class="flex flex-1 flex-col min-inline-none">
    <span class="truncate text-small font-semibold">
      {choice.kind === "series"
        ? lookOf(choice.series).title
        : choice.place.label()}
    </span>
    <span class="text-caption text-muted">
      {choice.kind === "series"
        ? m.library_series_books({ count: choice.series.bookCount })
        : (choice.place.within?.() ?? "")}
    </span>
  </span>
  {#if isActive}
    <span aria-hidden="true" class="shrink-0 text-caption text-muted">
      {m.search_key_open()}
    </span>
  {/if}
</Command.Item>
