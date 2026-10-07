<script lang="ts">
  import { FolderMinus } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
  import type { Notices } from "$lib/notices/notices.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import type { AddFolder } from "./add-folder";
  import AddFolderButton from "./AddFolderButton.svelte";
  import { FolderAdding } from "./folder-adding.svelte";
  import FolderNotice from "./FolderNotice.svelte";
  import FolderRow from "./FolderRow.svelte";
  import { ACTION_ICON_SIZE } from "./icon-size";
  import type { LibraryFolders } from "./library-folders.svelte";
  import RemoveFolderDialog from "./RemoveFolderDialog.svelte";
  import RowActionButton from "./RowActionButton.svelte";

  let {
    folders,
    addFolder,
    notices,
    rowAction,
    status,
    usesStandIns,
    hint,
  }: {
    folders: LibraryFolders;
    addFolder: AddFolder;
    notices: Notices;
    rowAction?: Snippet<[LibraryFolder]>;
    status?: Snippet;
    usesStandIns: boolean;
    hint?: Snippet | undefined;
  } = $props();

  const adding = new FolderAdding(
    (onProgress) => addFolder(onProgress),
    () => notices,
    () => {
      void folders.load();
    },
  );

  let addButton: HTMLButtonElement | undefined = $state();
  let confirming: LibraryFolder | undefined = $state();
  let confirmingBooks: number | undefined = $state();
  let notRemoved: LibraryFolder | undefined = $state();
  let foldersHeading: HTMLHeadingElement | undefined = $state();
  const headingId = $props.id();

  let latestRemovalAsked = 0;

  /** Only the latest question shows its count, so a slow count can't land on a folder asked about after it. */
  async function confirmRemoval(folder: LibraryFolder): Promise<void> {
    const asked = ++latestRemovalAsked;
    confirming = folder;
    confirmingBooks = undefined;
    const books = await folders.countBooks(folder);
    if (asked === latestRemovalAsked) {
      confirmingBooks = books;
    }
  }

  async function remove(folder: LibraryFolder): Promise<void> {
    confirming = undefined;
    const outcome = await folders.remove(folder);
    notRemoved = outcome === "failed" ? folder : undefined;
    if (outcome === "removed") {
      adding.dismiss();
    }
    foldersHeading?.focus();
  }
</script>

<section aria-labelledby={headingId}>
  <div class="flex items-center justify-between gap-md">
    <h2
      id={headingId}
      tabindex="-1"
      bind:this={foldersHeading}
      class="text-footnote font-semibold text-muted touch:max-medium:ps-xs touch:max-medium:text-group-title touch:max-medium:font-bold touch:max-medium:text-foreground touch:medium:text-label"
    >
      {m.library_settings_folders()}
    </h2>
    <AddFolderButton
      bind:element={addButton}
      {adding}
      placement="section-heading"
    />
  </div>
  {#if hint !== undefined}
    <p class="mbs-sm text-footnote text-muted touch:max-medium:px-xs">
      {@render hint()}
    </p>
  {/if}
  {#if folders.list.kind === "loaded" && folders.list.linked.length > 0}
    <ul
      class="mbs-sm divide-y divide-border rounded-card border border-border bg-card"
    >
      {#each folders.list.linked as folder (folder.id)}
        <li>
          <FolderRow {folder}>
            {#snippet action()}
              {@render rowAction?.(folder)}
              <RowActionButton
                label={m.library_remove_folder_label({ name: folder.name })}
                tooltip={m.library_remove_folder()}
                onclick={() => {
                  void confirmRemoval(folder);
                }}
              >
                <FolderMinus size={ACTION_ICON_SIZE} aria-hidden="true" />
              </RowActionButton>
            {/snippet}
          </FolderRow>
        </li>
      {/each}
    </ul>
  {:else if folders.list.kind === "failed"}
    <p class="mbs-sm px-xs">{m.library_folders_failed()}</p>
  {/if}
  {@render status?.()}
  {#if notRemoved !== undefined}
    <p role="alert" class="mbs-sm px-xs">
      {m.library_remove_folder_failed({ name: notRemoved.name })}
    </p>
  {/if}
  <div class="mbs-sm">
    <FolderNotice
      {adding}
      {usesStandIns}
      onDismissed={() => {
        addButton?.focus();
      }}
    />
  </div>
</section>

<RemoveFolderDialog
  folder={confirming}
  books={confirmingBooks}
  onConfirm={(folder: LibraryFolder) => {
    void remove(folder);
  }}
  onCancel={() => {
    confirming = undefined;
  }}
/>
