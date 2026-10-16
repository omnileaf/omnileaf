<script lang="ts">
  import { FolderMinus } from "@lucide/svelte";
  import { type Snippet, tick } from "svelte";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import type { Notices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";

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
  let confirming: LibraryFolder | undefined = $state();
  let confirmingBooks: number | undefined = $state();
  let notRemoved: LibraryFolder | undefined = $state();
  let foldersHeading: HTMLHeadingElement | undefined = $state();
  const headingId = $props.id();
  const isBelowList = $derived(addPlacement === "below-list");

  const rows: Record<LibraryFolder["id"], HTMLLIElement> = {};

  let latestRemovalAsked = 0;
  let removalAsker: HTMLButtonElement | undefined;

  export function focusRow(folder: LibraryFolder): void {
    rows[folder.id]?.focus();
  }

  /** Apple platforms don't focus a button when it's clicked or tapped, so the closing dialog can't hand focus back to it by itself. */
  async function returnFocusToAsker(): Promise<void> {
    await tick();
    if (removalAsker?.isConnected === true) {
      removalAsker.focus();
    } else {
      foldersHeading?.focus();
    }
  }

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

<section
  aria-labelledby={headingId}
  class={[isBelowList && "flex flex-col gap-lg"]}
>
  <div
    class={isBelowList
      ? "contents"
      : "flex flex-col overflow-hidden rounded-card border border-border bg-card android:rounded-android-md android:border-transparent android:bg-android-container-low"}
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
    {#if folders.list.kind === "loaded" && folders.list.linked.length > 0}
      <ul
        class={[
          "divide-y divide-border",
          isBelowList && "rounded-card border border-border bg-card",
        ]}
      >
        {#each folders.list.linked as folder (folder.id)}
          <li
            bind:this={rows[folder.id]}
            tabindex="-1"
            class="focus-visible:rounded-card focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent"
          >
            <FolderRow {folder} isFoundEmpty={isFoundEmpty?.(folder) ?? false}>
              {#snippet action()}
                {@render rowAction?.(folder)}
                <RowActionButton
                  label={m.library_remove_folder_label({ name: folder.name })}
                  tooltip={m.library_remove_folder()}
                  onclick={(
                    event: MouseEvent & { currentTarget: HTMLButtonElement },
                  ) => {
                    removalAsker = event.currentTarget;
                    void confirmRemoval(folder);
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
  <div class="mbs-sm">
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

<RemoveFolderDialog
  folder={confirming}
  books={confirmingBooks}
  onConfirm={(folder: LibraryFolder) => {
    void remove(folder);
  }}
  onCancel={() => {
    confirming = undefined;
    void returnFocusToAsker();
  }}
/>
