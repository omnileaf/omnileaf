<script lang="ts">
  import { FolderMinus } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import type { Notices, UndoOffer } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import type { AddFolder } from "./add-folder";
  import AddFolderButton from "./AddFolderButton.svelte";
  import { FolderAdding } from "./folder-adding.svelte";
  import { folderTitle } from "./folder-title";
  import FolderNotice from "./FolderNotice.svelte";
  import FolderRow from "./FolderRow.svelte";
  import { ACTION_ICON_SIZE } from "./icon-size";
  import type { LibraryFolders } from "./library-folders.svelte";
  import RowActionButton from "./RowActionButton.svelte";

  let {
    folders,
    addFolder,
    notices,
    rowAction,
    rowNotice,
    isFoundEmpty,
    status,
    usesStandIns,
    hint,
    addPlacement = "card",
    onShowBooks,
  }: {
    folders: LibraryFolders;
    addFolder: AddFolder;
    notices: Notices;
    rowAction?: Snippet<[LibraryFolder]>;
    rowNotice?: Snippet<[LibraryFolder]>;
    isFoundEmpty?: (folder: LibraryFolder) => boolean;
    status?: Snippet;
    usesStandIns: boolean;
    hint?: Snippet | undefined;
    onShowBooks?: (() => void) | undefined;
    addPlacement?: "card" | "below-list";
  } = $props();

  const adding = new FolderAdding(
    (onProgress) => addFolder(onProgress),
    () => notices,
    () => {
      void folders.load();
    },
  );

  let addButton: HTMLElement | null = $state(null);
  let notRemoved: LibraryFolder | undefined = $state();
  let foldersHeading: HTMLHeadingElement | undefined = $state();
  const headingId = $props.id();
  const isBelowList = $derived(addPlacement === "below-list");

  const rows: Record<LibraryFolder["id"], HTMLLIElement> = {};

  const pendingRemovals = new SvelteSet<LibraryFolder["id"]>();
  const shownFolders = $derived(
    folders.list.kind === "loaded"
      ? folders.list.linked.filter((folder) => !pendingRemovals.has(folder.id))
      : [],
  );

  export function focusRow(folder: LibraryFolder): void {
    rows[folder.id]?.focus();
  }

  interface Removal {
    readonly folders: readonly LibraryFolder[];
    readonly offer: UndoOffer;
    isTakenOver: boolean;
  }

  let latestRemoval: Removal | undefined;

  function offerFor(
    removed: readonly LibraryFolder[],
  ): Pick<UndoOffer, "title" | "body"> {
    const [only] = removed;
    if (removed.length === 1 && only !== undefined) {
      return {
        title: m.library_folder_removed({ name: folderTitle(only) }),
        body: m.library_folder_removed_files_stay(),
      };
    }
    const names = new Intl.ListFormat(getLocale(), {
      type: "conjunction",
    }).format(removed.map(folderTitle));
    return {
      title: m.library_folders_removed({ count: removed.length }),
      body: m.library_folders_removed_files_stay({ names }),
    };
  }

  function removeWithUndo(folder: LibraryFolder): void {
    pendingRemovals.add(folder.id);
    foldersHeading?.focus();
    const earlier =
      latestRemoval !== undefined && notices.undoOffer === latestRemoval.offer
        ? latestRemoval
        : undefined;
    if (earlier !== undefined) {
      earlier.isTakenOver = true;
    }
    const removed = [...(earlier?.folders ?? []), folder];
    const removal: Removal = {
      folders: removed,
      isTakenOver: false,
      offer: {
        ...offerFor(removed),
        undo: () => {
          for (const each of removed) {
            pendingRemovals.delete(each.id);
          }
        },
        commit: () => {
          if (removal.isTakenOver) {
            return;
          }
          for (const each of removed) {
            void commitRemoval(each);
          }
        },
      },
    };
    latestRemoval = removal;
    notices.offerUndo(removal.offer);
  }

  async function commitRemoval(folder: LibraryFolder): Promise<void> {
    const outcome = await folders.remove(folder);
    pendingRemovals.delete(folder.id);
    notRemoved = outcome === "failed" ? folder : undefined;
    if (outcome === "removed") {
      adding.dismiss();
    }
  }
</script>

<section
  aria-labelledby={headingId}
  class={[isBelowList && "flex flex-col gap-lg"]}
>
  <div
    class={isBelowList
      ? "contents"
      : "flex flex-col overflow-hidden rounded-card border border-border bg-card android:rounded-android-md android:border-transparent android:bg-android-container-low ios-grouped:rounded-ios-cell ios-grouped:border-transparent ios-grouped:bg-ios-cell"}
  >
    <h2
      id={headingId}
      tabindex="-1"
      bind:this={foldersHeading}
      class={isBelowList
        ? "sr-only"
        : "px-lg pbs-md pbe-xs text-small font-semibold"}
    >
      {m.library_settings_folders()}
    </h2>
    {#if shownFolders.length > 0}
      <ul
        class={[
          "divide-y divide-border ios:divide-y-0",
          isBelowList && "rounded-card border border-border bg-card",
        ]}
      >
        {#each shownFolders as folder (folder.id)}
          <li
            bind:this={rows[folder.id]}
            tabindex="-1"
            class="relative focus-visible:rounded-card focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent ios:not-last:after:absolute ios:not-last:after:inset-s-ios-folder-separator ios:not-last:after:inset-e-none ios:not-last:after:inset-be-none ios:not-last:after:border-be ios:not-last:after:border-ios-separator"
          >
            <FolderRow {folder} isFoundEmpty={isFoundEmpty?.(folder) ?? false}>
              {#snippet action()}
                {@render rowAction?.(folder)}
                <RowActionButton
                  label={m.library_remove_folder_label({ name: folder.name })}
                  tooltip={m.library_remove_folder()}
                  onclick={() => {
                    removeWithUndo(folder);
                  }}
                >
                  <FolderMinus size={ACTION_ICON_SIZE} aria-hidden="true" />
                </RowActionButton>
              {/snippet}
            </FolderRow>
            {@render rowNotice?.(folder)}
          </li>
        {/each}
      </ul>
    {/if}
    {#if !isBelowList && folders.list.kind === "loaded" && shownFolders.length === 0}
      <p class="px-lg pbe-xs text-body">{m.library_folders_none()}</p>
    {/if}
    {#if !isBelowList}
      <div class="px-lg pbs-sm pbe-md">
        <AddFolderButton
          bind:element={addButton}
          {adding}
          placement="card-foot"
        />
      </div>
    {/if}
  </div>
  {#if folders.list.kind === "failed"}
    <p class="mbs-sm px-xs">{m.library_folders_failed()}</p>
  {/if}
  {@render status?.()}
  {#if notRemoved !== undefined}
    <p role="alert" class="mbs-sm px-xs">
      {m.library_remove_folder_failed({ name: notRemoved.name })}
    </p>
  {/if}
  {#if isBelowList}
    <AddFolderButton bind:element={addButton} {adding} placement="below-list" />
    {#if hint !== undefined}
      <p class="text-footnote text-muted">{@render hint()}</p>
    {/if}
  {/if}
  <div class={isBelowList ? "contents" : "mbs-sm"}>
    <FolderNotice
      {adding}
      {notices}
      {usesStandIns}
      onShow={onShowBooks}
      onDismissed={() => {
        addButton?.focus();
      }}
    />
  </div>
</section>
