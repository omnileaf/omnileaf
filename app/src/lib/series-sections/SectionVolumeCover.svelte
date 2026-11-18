<script lang="ts">
  import type { ResolvedPathname } from "$app/types";
  import { cn } from "#lib/components/cn.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { PICKED_COVER_RING } from "#lib/library/cover-tile.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import PickableLink from "#lib/library/PickableLink.svelte";
  import SelectionMark from "#lib/library/SelectionMark.svelte";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import type { Selection } from "#lib/page/selection.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { ROW_PROGRESS } from "#lib/series/row-progress.ts";

  import type { SectionTileLook } from "./section-tile";
  import { type PickKey, type SectionTile, volumeKey } from "./section-tiles";
  import { volumeProgressOf, volumeTileMeta } from "./volume-tile-words";

  let {
    tile,
    href,
    cover,
    look,
    selection,
    order,
  }: {
    tile: Extract<SectionTile, { kind: "volume" }>;
    href: ResolvedPathname;
    cover: ShownCover;
    look: SectionTileLook;
    selection: Selection<PickKey> | undefined;
    order: () => readonly PickKey[];
  } = $props();

  const key = $derived(volumeKey(tile.volume));
  const title = $derived(m.series_volume({ number: tile.volume }));
  const meta = $derived(
    tile.counts === undefined ? undefined : volumeTileMeta(tile.counts),
  );
  const progress = $derived(
    tile.counts === undefined ? undefined : volumeProgressOf(tile.counts),
  );
  const isRead = $derived(
    tile.counts !== undefined &&
      tile.counts.readCount === tile.counts.bookCount,
  );
  const isSelecting = $derived(selection?.isSelecting === true);
  const isPicked = $derived(selection?.has(key) === true);
</script>

<div data-pick-key={key}>
  <PickableLink
    id={key}
    {href}
    {title}
    {selection}
    {order}
    data-volume-link
    class={look.link}
  >
    <span class={[look.cover, isPicked && PICKED_COVER_RING]}>
      <CoverImage {cover} {coverUrl} />
      {#if isSelecting}
        <SelectionMark isOn={isPicked} />
      {:else if isRead}
        <span data-read-mark aria-hidden="true" class={look.readMark}>
          <Icon name="check" size={look.readCheckSize} />
        </span>
      {/if}
    </span>
    {#if progress !== undefined}
      <span aria-hidden="true" class="contents">
        <Progress
          aria-label={meta}
          max={progress.total}
          value={progress.read}
          class={cn(ROW_PROGRESS, "inline-full")}
        />
      </span>
    {/if}
    <span class="flex flex-col min-inline-none">
      <span class={look.title}>{title}</span>
      {#if meta !== undefined}
        <span class={look.meta}>{meta}</span>
      {/if}
    </span>
  </PickableLink>
</div>
