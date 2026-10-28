<script lang="ts">
  import { BookOpen, CircleAlert, Copy, FolderPlus } from "@lucide/svelte";

  import { Card } from "#lib/components/ui/card/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { dropWhat, refusalLines, skippedLines } from "./drop-text.ts";
  import type { DropState } from "./file-drop.svelte.ts";

  const KEY_MARK = "\u0000";

  let {
    state,
    shownName,
  }: { state: DropState; shownName: (name: string) => string } = $props();

  const hint = $derived(
    m.drop_alt_hint({ key: KEY_MARK }).split(KEY_MARK) as [string, string],
  );
</script>

{#if state.kind === "offering"}
  <div
    data-slot="drop-layer"
    role="status"
    aria-live="polite"
    aria-label={m.drop_label()}
    class="pointer-events-auto fixed inset-none z-tooltip flex flex-col items-center justify-center gap-lg bg-background/85 p-xl backdrop-blur-menu windows:inset-xs windows:rounded-dialog windows:border-2 windows:border-dashed windows:border-accent windows:bg-accent-soft"
  >
    <p class="font-semibold">{dropWhat(state.summary, shownName)}</p>
    <div class="flex flex-wrap justify-center gap-lg">
      <Card
        data-drop-target="readNow"
        data-over={state.over === "readNow"}
        class="flex flex-col items-center gap-sm border-2 border-dashed p-xl text-center windows:border windows:border-windows-stroke-strong drop-over:border-solid drop-over:border-accent drop-over:bg-accent-soft windows:drop-over:border-2"
      >
        <BookOpen aria-hidden="true" />
        <p class="font-semibold">{m.drop_read_now()}</p>
        <p class="text-muted">
          {m.drop_read_now_detail({
            name: shownName(state.summary.first ?? ""),
          })}
        </p>
      </Card>
      <Card
        data-drop-target="add"
        data-over={state.over === "add"}
        data-copies={state.copies}
        class="flex flex-col items-center gap-sm border-2 border-dashed p-xl text-center windows:border windows:border-windows-stroke-strong drop-over:border-solid drop-over:border-accent drop-over:bg-accent-soft windows:drop-over:border-2"
      >
        <FolderPlus aria-hidden="true" />
        <p class="font-semibold">{m.drop_add()}</p>
        <p class="text-muted">
          {state.copies ? m.drop_copy_detail() : m.drop_add_detail()}
        </p>
      </Card>
    </div>
    <Card
      data-drop-target="copy"
      data-over={state.over === "copy"}
      class="flex items-center gap-sm border-2 border-dashed px-lg py-md text-center text-detail windows:border windows:border-windows-stroke-strong drop-over:border-solid drop-over:border-accent drop-over:bg-accent-soft windows:drop-over:border-2"
    >
      <Copy aria-hidden="true" />
      <p class="font-semibold">{m.drop_copy_into_home()}</p>
    </Card>
    <p class="text-muted">
      {hint[0]}<Kbd>{m.drop_key_alt()}</Kbd>{hint[1]}
    </p>
    {#each skippedLines(state.summary.refused, shownName) as line (line)}
      <p class="text-detail text-muted">{line}</p>
    {/each}
  </div>
{:else if state.kind === "refused"}
  <div
    data-slot="drop-layer"
    role="status"
    aria-label={m.drop_label()}
    class="pointer-events-auto fixed inset-none z-tooltip flex flex-col items-center justify-center bg-background/85 p-xl backdrop-blur-menu windows:inset-xs windows:rounded-dialog windows:border-2 windows:border-dashed windows:border-danger"
  >
    <Card class="flex flex-col items-center gap-sm p-xl text-center">
      <CircleAlert aria-hidden="true" class="windows:text-danger" />
      <p class="font-semibold">{m.drop_nothing_added()}</p>
      {#each refusalLines(state.refused, shownName) as line (line)}
        <p class="text-muted">{line}</p>
      {/each}
      <p class="text-muted">{m.drop_what_it_reads()}</p>
    </Card>
  </div>
{/if}
