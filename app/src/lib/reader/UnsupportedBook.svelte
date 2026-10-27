<script lang="ts">
  import { FileX, FolderOpen } from "@lucide/svelte";
  import { untrack } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import type { BookFile, BookPlace, Platform } from "#lib/ipc/bindings.ts";
  import { actionGroupLook } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookBackNav from "./BookBackNav.svelte";
  import { fileKindsOpened, fileTypeLabel } from "./file-types.ts";
  import ProblemHeading from "./ProblemHeading.svelte";
  import { PROBLEM_TEXT, problemLayout } from "./problem-heading.ts";
  import { TODAYS_PROBLEM_ACTIONS } from "./problem-actions.ts";
  import { readerSettings } from "./reader-settings.svelte.ts";

  const BUTTON_ICON_SIZE = 16;
  const WRAPPING_ACTION = "max-inline-full whitespace-normal text-center";

  let {
    place,
    file,
    platform,
  }: {
    place: BookPlace | null;
    file: BookFile | null;
    platform: Platform;
  } = $props();

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
        <button type="button" disabled class={other}>
          <FolderOpen size={BUTTON_ICON_SIZE} aria-hidden="true" />
          {m.reader_coming_soon({ feature: showFile })}
        </button>
      </div>
    </section>
  </div>
</main>
