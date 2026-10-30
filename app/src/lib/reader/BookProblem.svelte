<script lang="ts">
  import {
    ArrowLeft,
    FileX,
    FolderOpen,
    FolderSearch,
    Library,
    TriangleAlert,
  } from "@lucide/svelte";
  import { untrack } from "svelte";

  import { resolve } from "$app/paths";
  import {
    Empty,
    EmptyDescription,
    EmptyMedia,
  } from "#lib/components/ui/empty/index.ts";
  import type { BookPlace, Platform } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { problemActionGroup, problemLook } from "#lib/page/problem-look.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookBackNav from "./BookBackNav.svelte";
  import { TODAYS_PROBLEM_ACTIONS } from "./problem-actions.ts";
  import type { BookProblem } from "./opened-book.ts";
  import { readerSettings } from "./reader-settings.svelte.ts";

  const BUTTON_ICON_SIZE = 16;
  const SAYINGS = {
    missing: {
      icon: FolderSearch,
      title: m.reader_not_found,
      body: m.reader_not_found_body,
    },
    unreadable: {
      icon: FileX,
      title: m.reader_unreadable,
      body: m.reader_unreadable_body,
    },
    failed: {
      icon: TriangleAlert,
      title: m.reader_failed_title,
      body: m.reader_failed,
    },
  } satisfies Record<BookProblem, unknown>;

  let {
    kind,
    place,
    platform,
  }: { kind: BookProblem; place: BookPlace | null; platform: Platform } =
    $props();

  const inLibraryPlace = $derived(
    place !== null && place.isInLibrary ? place : null,
  );
  const settings = untrack(() =>
    readerSettings(place !== null && place.isInLibrary ? place.series : ""),
  );
  const saying = $derived(SAYINGS[kind]);
  const libraryHref = resolve("/(app)");
  const seriesHref = $derived(
    inLibraryPlace === null
      ? undefined
      : resolve("/(app)/series/[id]", { id: inLibraryPlace.series }),
  );
  const showFile = $derived(showFileLabel(platform));
  const look = $derived(problemLook(platform));
  const width = new WindowWidth();
  const actions = $derived(
    problemActionGroup(platform, width.current, TODAYS_PROBLEM_ACTIONS),
  );
</script>

<main
  data-theme={settings.look.controls === "dark" ? "dark" : undefined}
  data-ground="grouped"
  class="flex flex-col bg-background text-foreground min-block-dvh touch:bg-native-grouped-ground"
>
  <BookBackNav {place} {platform} />
  <div class="flex flex-1 items-center justify-center px-xl pbe-xl">
    <Empty
      class="gap-lg max-inline-book-problem expanded:max-inline-book-problem-wide"
    >
      <div class="flex flex-col items-center gap-sm">
        <EmptyMedia class={look.media}>
          <saying.icon size={look.iconSize} aria-hidden="true" />
        </EmptyMedia>
        <h1 tabindex="-1" class={look.bookTitle}>
          {saying.title()}
        </h1>
        <EmptyDescription class="text-small">{saying.body()}</EmptyDescription>
      </div>
      <div class={actions.group}>
        {#if seriesHref === undefined}
          <a href={libraryHref} class={actions.main}>
            <Library size={BUTTON_ICON_SIZE} aria-hidden="true" />
            {m.reader_back_label()}
          </a>
        {:else}
          <a href={seriesHref} class={actions.main}>
            <ArrowLeft size={BUTTON_ICON_SIZE} aria-hidden="true" />
            {m.reader_back_to_the_series()}
          </a>
        {/if}
        {#if kind === "unreadable"}
          <button type="button" disabled class={actions.other}>
            <FolderOpen size={BUTTON_ICON_SIZE} aria-hidden="true" />
            {m.reader_coming_soon({ feature: showFile })}
          </button>
        {/if}
      </div>
    </Empty>
  </div>
</main>
