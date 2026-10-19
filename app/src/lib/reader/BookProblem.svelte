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
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookBackNav from "./BookBackNav.svelte";
  import type { BookProblem } from "./opened-book.ts";
  import { readerSettings } from "./reader-settings.svelte.ts";

  const PROBLEM_ICON_SIZE = 20;
  const BUTTON_ICON_SIZE = 16;
  const BUTTON =
    "flex shrink-0 items-center justify-center gap-sm rounded-shadcn-button px-lg text-body font-medium whitespace-nowrap transition-control min-block-touch-target expanded:text-small expanded:min-block-pointer-button ios:rounded-ios-button ios:min-block-ios-control";
  const PRIMARY = `${BUTTON} bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed`;
  const OUTLINE = `${BUTTON} border border-border bg-card disabled:opacity-60 ios:border-transparent ios:bg-ios-fill`;
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
</script>

<main
  data-theme={settings.look.controls === "dark" ? "dark" : undefined}
  data-ground="grouped"
  class="flex flex-col bg-background text-foreground min-block-dvh ios:bg-ios-grouped"
>
  <BookBackNav {place} />
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
      <div class="flex flex-col items-center gap-sm expanded:flex-row">
        {#if seriesHref === undefined}
          <a href={libraryHref} class={PRIMARY}>
            <Library size={BUTTON_ICON_SIZE} aria-hidden="true" />
            {m.reader_back_label()}
          </a>
        {:else}
          <a href={seriesHref} class={PRIMARY}>
            <ArrowLeft size={BUTTON_ICON_SIZE} aria-hidden="true" />
            {m.reader_back_to_the_series()}
          </a>
        {/if}
        {#if kind === "unreadable"}
          <button type="button" disabled class={OUTLINE}>
            <FolderOpen size={BUTTON_ICON_SIZE} aria-hidden="true" />
            {m.reader_coming_soon({ feature: showFile })}
          </button>
        {/if}
      </div>
    </Empty>
  </div>
</main>
