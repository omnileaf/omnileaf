<script lang="ts">
  import { CircleAlert, FolderSearch } from "@lucide/svelte";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
  import type { EmptiedFolder } from "./rescans.svelte";

  const BADGE_ICON_SIZE = 18;

  const BUTTON =
    "rounded-full px-lg text-detail font-bold transition-control min-block-touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 medium:rounded-control desktop:rounded-control desktop:px-md desktop:min-block-compact-button";

  interface Look {
    readonly role: "status" | "alert";
    readonly card: string;
    readonly badge: string;
    readonly icon: Glyph;
    readonly title: (inputs: { name: string }) => string;
    readonly body: (inputs: { name: string }) => string;
    readonly remove: () => string;
  }

  const LOOKS = {
    foundEmpty: {
      role: "status",
      card: "border-warning-edge bg-warning-soft text-on-warning",
      badge: "bg-warning",
      icon: FolderSearch,
      title: m.library_found_empty_title,
      body: m.library_found_empty_body,
      remove: m.library_remove_books,
    },
    removalFailed: {
      role: "alert",
      card: "border-danger-soft bg-danger-soft text-foreground",
      badge: "bg-card text-danger",
      icon: CircleAlert,
      title: m.library_remove_books_failed,
      body: m.library_remove_books_failed_body,
      remove: m.library_remove_books_try_again,
    },
  } satisfies Record<EmptiedFolder, Look>;

  let {
    folder,
    emptied,
    isBusy,
    onRescan,
    onRemove,
  }: {
    folder: LibraryFolder;
    emptied: EmptiedFolder;
    isBusy: boolean;
    onRescan: (asker: HTMLButtonElement) => void;
    onRemove: (asker: HTMLButtonElement) => void;
  } = $props();

  const titleId = $props.id();
  const look: Look = $derived(LOOKS[emptied]);
  const name = $derived(folderTitle(folder));
</script>

<div
  role={look.role}
  aria-labelledby={titleId}
  class={[
    "mx-sm mbe-sm flex flex-col gap-sm rounded-card border p-md",
    look.card,
  ]}
>
  <div class="flex items-center gap-md">
    <span
      aria-hidden="true"
      class={[
        "flex shrink-0 items-center justify-center rounded-full block-icon-tile inline-icon-tile",
        look.badge,
      ]}
    >
      <look.icon size={BADGE_ICON_SIZE} />
    </span>
    <h3 id={titleId} class="text-callout font-bold desktop:text-label">
      {look.title({ name })}
    </h3>
  </div>
  <p class="text-detail opacity-85">{look.body({ name })}</p>
  <div class="flex flex-wrap justify-end gap-sm">
    <button
      type="button"
      disabled={isBusy}
      class={[
        BUTTON,
        "border border-current/35 enabled:hover:bg-hover enabled:active:bg-pressed",
      ]}
      onclick={(event) => {
        onRescan(event.currentTarget);
      }}
    >
      {m.library_rescan_folder()}
    </button>
    <button
      type="button"
      disabled={isBusy}
      class={[
        BUTTON,
        "bg-accent text-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed",
      ]}
      onclick={(event) => {
        onRemove(event.currentTarget);
      }}
    >
      {look.remove()}
    </button>
  </div>
</div>
