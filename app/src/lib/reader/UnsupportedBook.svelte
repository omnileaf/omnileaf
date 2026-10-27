<script lang="ts">
  import { EyeOff, FileX, FolderOpen } from "@lucide/svelte";
  import { untrack } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import type {
    BookFile,
    BookPlace,
    commands,
    FileType,
    Platform,
  } from "#lib/ipc/bindings.ts";
  import type { Notices } from "#lib/notices/notices.ts";
  import { actionGroupLook } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookBackNav from "./BookBackNav.svelte";
  import { fileKindsOpened, fileTypeLabel } from "./file-types.ts";
  import ProblemHeading from "./ProblemHeading.svelte";
  import {
    PROBLEM_CAPTION,
    PROBLEM_TEXT,
    problemLayout,
  } from "./problem-heading.ts";
  import { TODAYS_PROBLEM_ACTIONS } from "./problem-actions.ts";
  import { readerSettings } from "./reader-settings.svelte.ts";

  const BUTTON_ICON_SIZE = 16;
  const WRAPPING_ACTION = "max-inline-full whitespace-normal text-center";

  type Hiding = "offered" | "asking" | "hidden";

  let {
    place,
    file,
    platform,
    hideFilesLike,
    showFileType,
    notices,
  }: {
    place: BookPlace | null;
    file: BookFile | null;
    platform: Platform;
    hideFilesLike: typeof commands.hideFilesLike;
    showFileType: typeof commands.showFileType;
    notices: Notices;
  } = $props();

  let hiding: Hiding = $state("offered");

  const settings = untrack(() => readerSettings(place?.series ?? ""));
  const showFile = $derived(showFileLabel(platform));
  const width = new WindowWidth();
  const layout = $derived(problemLayout(platform, width.current));
  const actions = $derived(
    actionGroupLook(platform, width.current, TODAYS_PROBLEM_ACTIONS),
  );
  const group = $derived(cn(actions.group, "flex-wrap"));
  const other = $derived(cn(actions.other, WRAPPING_ACTION));
  const body = $derived(
    file === null || file.fileType === null
      ? m.reader_unsupported_body_unnamed()
      : m.reader_unsupported_body({
          file: file.name,
          type: fileTypeLabel(file.fileType),
        }),
  );
  const caption = $derived(
    file === null || file.fileType === null
      ? m.reader_hide_caption_unnamed()
      : m.reader_hide_caption({ type: fileTypeLabel(file.fileType) }),
  );

  async function hide(book: BookPlace["id"]): Promise<void> {
    if (hiding !== "offered") {
      return;
    }
    hiding = "asking";
    const hidden = await hideFilesLike(book);
    if (hidden.status === "error") {
      reportError(hidden.error);
      hiding = "offered";
      return;
    }
    hiding = "hidden";
    offerToShow(hidden.data);
  }

  function offerToShow(fileType: FileType): void {
    notices.offerUndo({
      title: m.file_type_hidden({ type: fileTypeLabel(fileType) }),
      body: m.file_type_hidden_note(),
      undo: () => {
        void showAgain(fileType);
      },
    });
  }

  async function showAgain(fileType: FileType): Promise<void> {
    const shown = await showFileType(fileType);
    if (shown.status === "error") {
      reportError(shown.error);
      return;
    }
    hiding = "offered";
  }
</script>

<main
  data-theme={settings.look.controls === "dark" ? "dark" : undefined}
  data-ground="grouped"
  class="flex flex-col bg-background text-foreground min-block-dvh touch:bg-native-grouped-ground"
>
  <BookBackNav {place} {platform} />
  <div
    class="flex flex-1 items-center justify-center px-md pbe-xl expanded:px-xl"
  >
    <section class="flex flex-col gap-lg inline-full max-inline-damaged-book">
      <ProblemHeading icon={FileX} {platform}>
        {m.reader_unsupported_title()}
      </ProblemHeading>
      <p
        class={[
          "text-body wrap-anywhere expanded:text-small",
          PROBLEM_TEXT[layout],
        ]}
      >
        {body}
      </p>
      <Card class="flex flex-col gap-md py-lg">
        <CardHeader class="px-lg">
          <CardTitle class="text-body expanded:text-small">
            {m.reader_opens_title()}
          </CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-md px-lg">
          <ul class="flex flex-wrap gap-sm">
            {#each fileKindsOpened() as kind (kind)}
              <li><Badge look="secondary">{kind}</Badge></li>
            {/each}
          </ul>
          <p class="text-small text-muted">{m.reader_not_yet()}</p>
        </CardContent>
      </Card>
      <div class={group}>
        {#if place !== null}
          <button
            type="button"
            aria-disabled={hiding === "offered" ? undefined : "true"}
            class={[other, "aria-disabled:opacity-60"]}
            onclick={() => hide(place.id)}
          >
            <EyeOff size={BUTTON_ICON_SIZE} aria-hidden="true" />
            {m.reader_hide_files_like()}
          </button>
        {/if}
        <button type="button" disabled class={other}>
          <FolderOpen size={BUTTON_ICON_SIZE} aria-hidden="true" />
          {m.reader_coming_soon({ feature: showFile })}
        </button>
      </div>
      {#if place !== null}
        <p class={["text-small text-muted", PROBLEM_CAPTION[layout]]}>
          {caption}
        </p>
      {/if}
    </section>
  </div>
</main>
