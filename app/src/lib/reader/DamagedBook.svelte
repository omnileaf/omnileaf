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
  import type { BookDamage, OpenedBook, Platform } from "#lib/ipc/bindings.ts";
  import { actionGroupLook } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookBackNav from "./BookBackNav.svelte";
  import ProblemHeading from "./ProblemHeading.svelte";
  import { PROBLEM_TEXT, problemLayout } from "./problem-heading.ts";
  import { TODAYS_PROBLEM_ACTIONS } from "./problem-actions.ts";
  import { readerSettings } from "./reader-settings.svelte.ts";

  const BUTTON_ICON_SIZE = 16;

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
  const width = new WindowWidth();
  const layout = $derived(problemLayout(platform, width.current));
  const actions = $derived(
    actionGroupLook(platform, width.current, TODAYS_PROBLEM_ACTIONS),
  );
</script>

<main
  data-theme={settings.look.controls === "dark" ? "dark" : undefined}
  data-ground="grouped"
  class="flex flex-col bg-background text-foreground min-block-dvh touch:bg-native-grouped-ground"
>
  <BookBackNav
    {platform}
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
      <ProblemHeading icon={FileExclamationPoint} {platform}>
        {m.reader_damaged_title({ title: book.title })}
      </ProblemHeading>
      <p class={["text-body expanded:text-small", PROBLEM_TEXT[layout]]}>
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
      <div class={actions.group}>
        <button type="button" class={actions.main} onclick={onRead}>
          <BookOpen size={BUTTON_ICON_SIZE} aria-hidden="true" />
          {m.reader_read_pages_that_work({ count: readable })}
        </button>
        <button type="button" disabled class={actions.other}>
          <FolderOpen size={BUTTON_ICON_SIZE} aria-hidden="true" />
          {m.reader_coming_soon({ feature: showFile })}
        </button>
      </div>
    </section>
  </div>
</main>
