<script lang="ts">
  import {
    BookOpen,
    FileExclamationPoint,
    FolderOpen,
    TriangleAlert,
  } from "@lucide/svelte";
  import { untrack } from "svelte";

  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import { EmptyMedia } from "#lib/components/ui/empty/index.ts";
  import type { BookDamage, OpenedBook, Platform } from "#lib/ipc/bindings.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookBackNav from "./BookBackNav.svelte";
  import { readerSettings } from "./reader-settings.svelte.ts";

  const HEADING_ICON_SIZE = 20;
  const BUTTON_ICON_SIZE = 16;
  const BUTTON =
    "flex shrink-0 items-center justify-center gap-sm rounded-shadcn-control px-lg text-body font-medium whitespace-nowrap transition-control min-block-touch-target expanded:text-small expanded:min-block-pointer-button ios:rounded-ios-button ios:min-block-ios-control";
  const PRIMARY = `${BUTTON} bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed`;
  const OUTLINE = `${BUTTON} border border-border bg-card disabled:opacity-60 ios:border-transparent ios:bg-ios-fill`;

  let {
    book,
    damage,
    platform,
    onRead,
  }: {
    book: OpenedBook;
    damage: BookDamage;
    platform: Platform;
    onRead: () => void;
  } = $props();

  const settings = untrack(() => readerSettings(book.series));
  const readable = $derived(book.pages.length);
  const showFile = $derived(showFileLabel(platform));
</script>

<main
  data-theme={settings.look.controls === "dark" ? "dark" : undefined}
  data-ground="grouped"
  class="flex flex-col bg-background text-foreground min-block-dvh ios:bg-ios-grouped"
>
  <BookBackNav
    place={{
      id: book.id,
      title: book.title,
      series: book.series,
      seriesTitle: book.seriesTitle,
    }}
  />
  <div
    class="flex flex-1 items-center justify-center px-md pbe-xl expanded:px-xl"
  >
    <section class="flex flex-col gap-lg inline-full max-inline-damaged-book">
      <div class="flex items-center gap-md">
        <EmptyMedia class="shrink-0">
          <FileExclamationPoint size={HEADING_ICON_SIZE} aria-hidden="true" />
        </EmptyMedia>
        <h1
          tabindex="-1"
          class="text-group-title font-semibold tracking-tight text-pretty expanded:text-body"
        >
          {m.reader_damaged_title({ title: book.title })}
        </h1>
      </div>
      <p class="text-body expanded:text-small">
        {m.reader_damaged_count({
          readable,
          promised: damage.promisedPages,
        })}
      </p>
      <Alert tone="plain" icon={TriangleAlert} role="alert">
        <AlertTitle class="text-small font-semibold">
          {m.reader_damaged_ends_early({
            first: readable + 1,
            last: damage.promisedPages,
          })}
        </AlertTitle>
        <AlertDescription class="text-small text-muted">
          {m.reader_damaged_ends_early_body()}
        </AlertDescription>
      </Alert>
      <div class="flex flex-col items-center gap-sm expanded:flex-row">
        <button type="button" class={PRIMARY} onclick={onRead}>
          <BookOpen size={BUTTON_ICON_SIZE} aria-hidden="true" />
          {m.reader_read_pages_that_work({ count: readable })}
        </button>
        <button type="button" disabled class={OUTLINE}>
          <FolderOpen size={BUTTON_ICON_SIZE} aria-hidden="true" />
          {m.reader_coming_soon({ feature: showFile })}
        </button>
      </div>
    </section>
  </div>
</main>
