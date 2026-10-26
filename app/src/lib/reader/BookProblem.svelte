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
  import { actionGroupLook } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookBackNav from "./BookBackNav.svelte";
  import { TODAYS_PROBLEM_ACTIONS } from "./problem-actions.ts";
  import type { BookProblem } from "./opened-book.ts";
  import { readerSettings } from "./reader-settings.svelte.ts";

  const PROBLEM_ICON_SIZE = 20;
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

  const settings = untrack(() => readerSettings(place?.series ?? ""));
  const saying = $derived(SAYINGS[kind]);
  const libraryHref = resolve("/(app)");
  const seriesHref = $derived(
    place === null
      ? undefined
      : resolve("/(app)/series/[id]", { id: place.series }),
  );
  const showFile = $derived(showFileLabel(platform));
  const width = new WindowWidth();
  const actions = $derived(
    actionGroupLook(platform, width.current, TODAYS_PROBLEM_ACTIONS),
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
        <EmptyMedia>
          <saying.icon size={PROBLEM_ICON_SIZE} aria-hidden="true" />
        </EmptyMedia>
        <h1
          tabindex="-1"
          class="text-group-title font-semibold tracking-tight expanded:text-body"
        >
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
