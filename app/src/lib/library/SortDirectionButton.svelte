<script lang="ts">
  import { ArrowDown, ArrowUp } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { LibrarySort } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  interface Wording {
    readonly label: () => string;
    readonly change: () => string;
  }

  const BY_TIME = [
    {
      label: m.library_sort_oldest_first,
      change: m.library_sort_oldest_first_change,
    },
    {
      label: m.library_sort_newest_first,
      change: m.library_sort_newest_first_change,
    },
  ] as const satisfies readonly [Wording, Wording];

  const WORDING = {
    title: [
      { label: m.library_sort_a_to_z, change: m.library_sort_a_to_z_change },
      { label: m.library_sort_z_to_a, change: m.library_sort_z_to_a_change },
    ],
    dateAdded: BY_TIME,
    lastRead: BY_TIME,
    lastUpdated: BY_TIME,
    unreadCount: [
      {
        label: m.library_sort_fewest_unread_first,
        change: m.library_sort_fewest_unread_first_change,
      },
      {
        label: m.library_sort_most_unread_first,
        change: m.library_sort_most_unread_first_change,
      },
    ],
  } satisfies Record<LibrarySort["by"], readonly [Wording, Wording]>;

  const LOOKS = {
    pill: "min-block-sort-direction rounded-full border-accent px-pill-inline text-detail text-accent",
    field: "block-panel-field px-pill-inline text-detail font-medium",
    icon: "justify-center block-panel-field inline-panel-field touch:block-touch-target touch:inline-touch-target android:rounded-full",
  } as const;

  const ICON_SIZE = 14;

  let {
    sort,
    look,
    onReverse,
  }: {
    sort: LibrarySort;
    look: keyof typeof LOOKS;
    onReverse: () => void;
  } = $props();

  const [ascending, descending] = $derived(WORDING[sort.by]);
  const wording = $derived(
    sort.direction === "ascending" ? ascending : descending,
  );
</script>

<Button
  type="button"
  look="outline"
  aria-label={wording.change()}
  class={["flex shrink-0 items-center gap-xs", LOOKS[look]]}
  onclick={onReverse}
>
  <span class={look === "icon" ? "sr-only" : undefined}>{wording.label()}</span>
  {#if sort.direction === "ascending"}
    <ArrowUp size={ICON_SIZE} aria-hidden="true" />
  {:else}
    <ArrowDown size={ICON_SIZE} aria-hidden="true" />
  {/if}
</Button>
