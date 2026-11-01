<script lang="ts">
  import { Trash } from "@lucide/svelte";
  import { onMount, type Snippet, tick } from "svelte";

  import ChangeHomeButton from "#lib/first-launch/ChangeHomeButton.svelte";
  import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
  import type { Notices } from "#lib/notices/notices.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPointer, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { AddFolder } from "./add-folder";
  import EmptiedFolderCard from "./EmptiedFolderCard.svelte";
  import { folderLocation } from "./folder-location";
  import { FolderAdding } from "./folder-adding.svelte";
  import { folderTitle } from "./folder-title";
  import HomeFolder from "./HomeFolder.svelte";
  import {
    type HomeCommands,
    HomeFolderChange,
  } from "./home-folder-change.svelte";
  import {
    type CountFolderBooks,
    LibraryFolders,
    type ListFolders,
    type RemoveFolder,
  } from "./library-folders.svelte";
  import LinkedFolders from "./LinkedFolders.svelte";
  import NativeEmptiedFolderCard from "./NativeEmptiedFolderCard.svelte";
  import RemoveBooksDialog from "./RemoveBooksDialog.svelte";
  import { readMovedHome } from "./read-moved-home";
  import RescanButton from "./RescanButton.svelte";
  import type { RescanFolder } from "./rescan-folder";
  import {
    type EmptiedFolder,
    type RemoveFolderBooks,
    Rescans,
  } from "./rescans.svelte";
  import RescanStatus from "./RescanStatus.svelte";
  import UseFoundHomeDialog from "./UseFoundHomeDialog.svelte";

  let {
    listFolders,
    removeFolder,
    countFolderBooks,
    addFolder,
    rescanFolder,
    removeFolderBooks,
    homeCommands,
    notices,
    usesStandIns,
    platform,
    onShowBooks,
  }: {
    listFolders: ListFolders;
    removeFolder: RemoveFolder;
    countFolderBooks: CountFolderBooks;
    addFolder: AddFolder;
    rescanFolder: RescanFolder;
    removeFolderBooks: RemoveFolderBooks;
    homeCommands: HomeCommands;
    notices: Notices;
    usesStandIns: boolean;
    platform: Platform;
    onShowBooks?: (() => void) | undefined;
  } = $props();

  const width = new WindowWidth();
  const isNative = $derived(phoneOf(platform, width.current) === "ios");

  const folders = new LibraryFolders(
    (after) => listFolders(after),
    (id) => removeFolder(id),
    (id) => countFolderBooks(id),
  );
  const adding = new FolderAdding(
    (onProgress) => addFolder(onProgress),
    () => notices,
    () => {
      void folders.load();
    },
  );
  const rescans = new Rescans(
    (id, onProgress) => rescanFolder(id, onProgress),
    (id) => removeFolderBooks(id),
  );

  const homeChange = new HomeFolderChange(
    {
      choose: () => homeCommands.choose(),
      use: () => homeCommands.use(),
      move: () => homeCommands.move(),
    },
    () => notices,
    (moved) => readMovedHome(folders, rescans, moved),
  );
  let changeHomeButton: HTMLButtonElement | null = $state(null);

  onMount(() => {
    void folders.load();
  });

  function homeHint(): string {
    if (platform === "ios") {
      return m.library_settings_home_folder_hint_ios({
        place: folderLocation({ kind: "home", location: "" }, platform),
      });
    }
    return isPointer(platform)
      ? m.library_settings_home_folder_hint_desktop()
      : m.library_settings_home_folder_hint();
  }

  async function turnDownFoundHome(): Promise<void> {
    homeChange.clearFound();
    await tick();
    changeHomeButton?.focus();
  }

  let linkedFolders: { focusRow: (folder: LibraryFolder) => void } | undefined =
    $state();
  let askingToRemoveBooks: LibraryFolder | undefined = $state();
  let booksToRemove: number | undefined = $state();
  let booksRemovalAsker: HTMLButtonElement | undefined;
  let latestBooksRemovalAsked = 0;

  /** Apple platforms don't focus a clicked button, so focus goes back to it by hand. */
  async function returnFocus(
    asker: HTMLButtonElement | undefined,
    folder: LibraryFolder,
  ): Promise<void> {
    await tick();
    if (asker?.isConnected === true) {
      asker.focus();
    } else {
      linkedFolders?.focusRow(folder);
    }
  }

  async function askToRemoveBooks(
    folder: LibraryFolder,
    asker: HTMLButtonElement,
  ): Promise<void> {
    const asked = ++latestBooksRemovalAsked;
    const books = await folders.countBooks(folder);
    if (asked !== latestBooksRemovalAsked || rescans.isBusy) {
      return;
    }
    booksRemovalAsker = asker;
    booksToRemove = books;
    askingToRemoveBooks = folder;
  }

  async function removeBooks(
    folder: LibraryFolder,
    asker: HTMLButtonElement | undefined,
  ): Promise<void> {
    askingToRemoveBooks = undefined;
    const removed = await rescans.removeBooks(folder);
    await folders.load();
    await returnFocus(asker, folder);
    if (removed !== undefined) {
      notices.show({
        tone: "plain",
        icon: Trash,
        title: m.library_books_removed({
          count: removed,
          name: folderTitle(folder),
        }),
      });
    }
  }

  function removeEmptiedBooks(
    folder: LibraryFolder,
    emptied: EmptiedFolder,
    asker: HTMLButtonElement,
  ): void {
    if (emptied === "removalFailed") {
      void removeBooks(folder, asker);
    } else {
      void askToRemoveBooks(folder, asker);
    }
  }

  const folderNotice: Snippet<[LibraryFolder]> = emptiedNotice;

  async function rescanEmptied(
    folder: LibraryFolder,
    asker: HTMLButtonElement,
  ): Promise<void> {
    latestBooksRemovalAsked += 1;
    await rescans.rescan(folder);
    await folders.load();
    await returnFocus(asker, folder);
  }
</script>

{#snippet changeHome()}
  <ChangeHomeButton
    bind:ref={changeHomeButton}
    {platform}
    isBusy={homeChange.isBusy}
    onclick={() => {
      void homeChange.choose();
    }}
  />
{/snippet}

{#snippet emptiedNotice(folder: LibraryFolder)}
  {@const emptied = rescans.emptied(folder)}
  {#if emptied !== undefined}
    {@const card = {
      folder,
      emptied,
      isBusy: rescans.isBusy,
      onRescan: (asker: HTMLButtonElement) => {
        void rescanEmptied(folder, asker);
      },
      onRemove: (asker: HTMLButtonElement) => {
        removeEmptiedBooks(folder, emptied, asker);
      },
    }}
    {#if isNative}
      <NativeEmptiedFolderCard {...card} />
    {:else}
      <EmptiedFolderCard {...card} />
    {/if}
  {/if}
{/snippet}

{#snippet emptiedNotices(shown: readonly LibraryFolder[])}
  {#each shown as folder (folder.id)}
    {@render folderNotice(folder)}
  {/each}
{/snippet}

{#snippet rescanButton(folder: LibraryFolder)}
  <RescanButton
    {folder}
    {rescans}
    onFinished={() => {
      void folders.load();
    }}
  />
{/snippet}

<div
  class="mbs-pane-gap flex flex-col gap-pane-gap two-pane:max-inline-section"
>
  <HomeFolder
    folders={folders.list}
    {platform}
    change={isPointer(platform) ? changeHome : undefined}
    rowAction={rescanButton}
  >
    <RescanStatus status={rescans.status} kind="home" />
    <p
      class={[
        "mbs-sm px-xs text-muted",
        isNative
          ? "px-lg text-native-notice-body/native-notice-body"
          : "text-caption",
      ]}
    >
      {homeHint()}
    </p>
  </HomeFolder>

  <LinkedFolders
    bind:this={linkedFolders}
    {platform}
    {folders}
    {adding}
    {notices}
    {usesStandIns}
    {onShowBooks}
    rowAction={rescanButton}
    rowNotice={isNative ? undefined : emptiedNotice}
    listNotice={isNative ? emptiedNotices : undefined}
    isFoundEmpty={(folder: LibraryFolder) =>
      rescans.emptied(folder) !== undefined}
  >
    {#snippet status()}
      <RescanStatus status={rescans.status} kind="linked" />
    {/snippet}
  </LinkedFolders>
</div>

<UseFoundHomeDialog
  found={homeChange.found}
  isBusy={homeChange.isBusy}
  onUse={() => {
    void homeChange.use();
  }}
  onCancel={() => {
    void turnDownFoundHome();
  }}
/>

<RemoveBooksDialog
  folder={askingToRemoveBooks}
  books={booksToRemove}
  onConfirm={(folder: LibraryFolder) => {
    void removeBooks(folder, booksRemovalAsker);
  }}
  onCancel={() => {
    const folder = askingToRemoveBooks;
    askingToRemoveBooks = undefined;
    if (folder !== undefined) {
      void returnFocus(booksRemovalAsker, folder);
    }
  }}
/>
