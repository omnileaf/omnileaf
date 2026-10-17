<script lang="ts">
  import {
    ArrowLeft,
    Eraser,
    LibraryBig,
    RotateCcwClock,
    Search,
  } from "@lucide/svelte";
  import { onMount, tick } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { getTimeFormatSetting } from "#lib/general/time-format.svelte.ts";
  import type { HistoryEntryActions } from "#lib/history/history-entry-actions.ts";
  import HistoryEntryRow from "#lib/history/HistoryEntryRow.svelte";
  import HistorySearchField from "#lib/history/HistorySearchField.svelte";
  import {
    type HistoryGroupName,
    historyGroups,
  } from "#lib/history/history-groups.ts";
  import { whenFormats } from "#lib/history/history-line.ts";
  import { historyList } from "#lib/history/history-list.svelte.ts";
  import {
    deviceLocale,
    firstDayOfWeek,
    localDayOf,
    weekStartOf,
  } from "#lib/history/local-date.ts";
  import { commands, type HistoryEntry } from "#lib/ipc/bindings.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { whenInView } from "#lib/paging/in-view.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { shortcut } from "#lib/shortcut.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const ICON_SIZE = 18;
  const FIELD_ICON_SIZE = 16;
  const SKELETON_ROWS = 6;
  const GROUP_NAMES = {
    today: m.history_today,
    yesterday: m.history_yesterday,
    thisWeek: m.history_this_week,
    earlier: m.history_earlier,
  } satisfies Record<HistoryGroupName, () => string>;

  const screenshotMode = getScreenshotMode();
  const notices = getNotices();
  const timeFormat = getTimeFormatSetting();
  const formats = $derived(whenFormats(getLocale(), timeFormat.hourCycle));
  const platform = $derived(data.appInfo.platform);
  const headingId = $props.id();

  let matching = $state("");
  let isSearching = $state(false);
  let wasCleared = $state(false);
  let wideField = $state<HTMLInputElement | null>(null);
  let narrowField = $state<HTMLInputElement | null>(null);
  let today = $state(localDayOf(new Date()));
  const calendar = $derived({
    today,
    weekStart: weekStartOf(today, firstDayOfWeek(deviceLocale())),
  });
  const history = historyList(() => ({ kind: "books", matching }));
  const listed = $derived(
    history.list.kind === "loaded"
      ? { items: history.list.items, isComplete: history.list.isComplete }
      : undefined,
  );
  const groups = $derived(
    listed === undefined ? [] : historyGroups(listed.items, calendar),
  );

  const actions: HistoryEntryActions = {
    continueReading: (entry) => {
      void goto(resolve("/read/[book]", { book: entry.book }));
    },
    openSeries: (entry) => {
      void goto(resolve("/(app)/series/[id]", { id: entry.series }));
    },
    remove: (entry) => {
      void remove(entry);
    },
  };

  async function remove(entry: HistoryEntry): Promise<void> {
    const removed = await commands.removeFromHistory(entry.book);
    if (removed.status === "error") {
      reportError(removed.error);
      return;
    }
    await history.load();
    notices.offerUndo({
      title: m.history_removed(),
      undo: () => {
        void commands
          .restoreToHistory(entry.book, removed.data)
          .then(() => history.load());
      },
    });
  }

  async function clear(): Promise<void> {
    const cleared = await commands.clearHistory();
    if (cleared.status === "error") {
      reportError(cleared.error);
      return;
    }
    wasCleared = true;
    await history.load();
    notices.offerUndo({
      title: m.history_cleared(),
      undo: () => {
        void commands.restoreHistory(cleared.data).then(() => history.load());
      },
    });
  }

  function find(text: string): void {
    matching = text;
    void history.start();
  }

  async function startSearching(): Promise<void> {
    isSearching = true;
    await tick();
    narrowField?.focus();
  }

  function stopSearching(): void {
    isSearching = false;
    find("");
  }

  function moveThroughEntries(event: KeyboardEvent): void {
    const from = event.target;
    if (!(from instanceof HTMLAnchorElement) || !from.dataset.historyBook) {
      return;
    }
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>("[data-history-book]"),
    ];
    const at = links.indexOf(from);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      links[at + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      const entry = listed?.items.find(
        ({ book }) => book === from.dataset.historyBook,
      );
      if (entry !== undefined) {
        (links[at + 1] ?? links[at - 1])?.focus();
        actions.remove(entry);
      }
    }
  }

  function readAgain(): void {
    today = localDayOf(new Date());
    void history.load();
  }

  onMount(() => {
    void history.start();
    return listenForLibraryChanges(readAgain, reportError);
  });
</script>

<svelte:window
  {@attach shortcut({
    key: "f",
    command: platform,
    shift: false,
    inTextFields: true,
    run: () => {
      if (wideField !== null && wideField.offsetParent !== null) {
        wideField.focus();
      } else {
        void startSearching();
      }
    },
  })}
/>

{#snippet headerActions()}
  <Tooltip label={m.history_search()}>
    {#snippet child({ props })}
      <Button
        {...props}
        look="icon"
        aria-label={m.history_search()}
        class="block-touch-target inline-touch-target hover:tint-hover active:tint-pressed large:hidden"
        onclick={() => {
          void startSearching();
        }}
      >
        <Search size={ICON_SIZE} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
  <HistorySearchField
    bind:field={wideField}
    text={matching}
    {platform}
    look="field"
    class="hidden inline-library-search large:flex"
    onFind={find}
  />
  <Tooltip label={m.history_clear()}>
    {#snippet child({ props })}
      <Button
        {...props}
        look="icon"
        aria-label={m.history_clear()}
        class="block-touch-target inline-touch-target hover:tint-hover active:tint-pressed large:block-pointer-button large:inline-pointer-button"
        onclick={() => {
          void clear();
        }}
      >
        <Eraser size={ICON_SIZE} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
{/snippet}

{#if isSearching}
  <h1 class="sr-only">{m.history_title()}</h1>
  <div class="flex items-center gap-sm large:hidden">
    <Tooltip label={m.history_back()}>
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          aria-label={m.history_back()}
          class="shrink-0 block-touch-target inline-touch-target hover:tint-hover active:tint-pressed"
          onclick={stopSearching}
        >
          <ArrowLeft size={ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
    <HistorySearchField
      bind:field={narrowField}
      text={matching}
      {platform}
      look="bar"
      class="flex-1"
      onFind={find}
    />
  </div>
{:else}
  <CollectionHeading
    {platform}
    title={m.history_title()}
    showsLabel={screenshotMode.showsLabel}
    actions={headerActions}
  />
{/if}

{#if history.list.kind === "failed"}
  <p class="mbs-sm text-muted">{m.history_failed()}</p>
{:else if history.list.kind === "loading"}
  <div
    role="status"
    aria-label={m.history_loading()}
    class="mbs-lg flex flex-col gap-md"
  >
    {#each { length: SKELETON_ROWS }, row (row)}
      <div class="flex items-center gap-md ps-xs">
        <Skeleton
          class="shrink-0 rounded-history-cover block-history-cover inline-history-cover"
        />
        <div class="flex flex-1 flex-col gap-xs">
          <Skeleton class="block-sm inline-3/5" />
          <Skeleton class="block-sm inline-4/5" />
        </div>
      </div>
    {/each}
  </div>
{:else if listed === undefined || listed.items.length === 0}
  {#if matching.trim() !== ""}
    <EmptyState
      icon={Search}
      title={m.history_no_match({ text: matching.trim() })}
      body={m.history_no_match_body()}
    />
  {:else}
    <EmptyState
      icon={RotateCcwClock}
      title={wasCleared ? m.history_cleared_title() : m.history_empty_title()}
      body={wasCleared ? m.history_cleared_body() : m.history_empty_body()}
    >
      <a
        href={resolve("/(app)")}
        class="mbs-lg flex items-center gap-sm rounded-full border border-border bg-card px-lg font-medium min-block-touch-target hover:tint-hover active:tint-pressed desktop:min-block-pointer-button"
      >
        <LibraryBig size={FIELD_ICON_SIZE} aria-hidden="true" />
        {m.history_go_to_library()}
      </a>
    </EmptyState>
  {/if}
{:else}
  <div
    role="presentation"
    class="mbs-md flex flex-col gap-md large:mbs-lg"
    onkeydown={moveThroughEntries}
  >
    {#each groups as group, index (group.name)}
      <section aria-labelledby={`${headingId}-${String(index)}`}>
        <h2
          id={`${headingId}-${String(index)}`}
          class="px-xs text-small font-semibold"
        >
          {GROUP_NAMES[group.name]()}
        </h2>
        <ul
          aria-labelledby={`${headingId}-${String(index)}`}
          class="flex flex-col large:divide-y large:divide-border"
        >
          {#each group.entries as entry (entry.book)}
            <HistoryEntryRow
              {entry}
              group={group.name}
              {formats}
              usesStandIns={screenshotMode.isOn}
              {actions}
            />
          {/each}
        </ul>
      </section>
    {/each}
    {#if listed !== undefined && !listed.isComplete}
      {#key listed.items.length}
        <div
          aria-hidden="true"
          class="block-2xs"
          {@attach whenInView(() => {
            void history.loadMore();
          })}
        ></div>
      {/key}
    {/if}
  </div>
{/if}
