<script lang="ts">
  import type { ComponentProps } from "svelte";

  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { Selection } from "#lib/page/selection.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SelectionBar from "#lib/series/SelectionBar.svelte";

  import SectionCovers from "./SectionCovers.svelte";

  type BookId = SeriesBook["id"];

  type Outcome =
    | { readonly kind: "none" }
    | {
        readonly kind: "marked";
        readonly mark: ReadMark;
        readonly count: number;
      }
    | { readonly kind: "failed" };

  let {
    onMark,
    ...covers
  }: Omit<ComponentProps<typeof SectionCovers>, "selection"> & {
    onMark: (books: BookId[], mark: ReadMark) => Promise<boolean>;
  } = $props();

  const selection = new Selection<BookId>();
  let outcome: Outcome = $state({ kind: "none" });

  function end(): void {
    selection.end();
  }

  async function mark(read: ReadMark): Promise<void> {
    const picked = selection.picked;
    const isMarked = await onMark(picked, read);
    outcome = isMarked
      ? { kind: "marked", mark: read, count: picked.length }
      : { kind: "failed" };
    if (isMarked) {
      end();
    }
  }

  function announced(shown: Outcome): string {
    switch (shown.kind) {
      case "none":
        return "";
      case "marked":
        return shown.mark === "read"
          ? m.series_marked_read({ count: shown.count })
          : m.series_marked_unread({ count: shown.count });
      case "failed":
        return m.series_mark_failed();
    }
  }
</script>

<SectionCovers {...covers} {selection} />
{#if selection.count > 0}
  <SelectionBar
    count={selection.count}
    onMark={(read: ReadMark) => {
      void mark(read);
    }}
    onClear={end}
  />
{/if}
<p
  role="status"
  class={outcome.kind === "failed" ? "text-body text-danger" : "sr-only"}
>
  {announced(outcome)}
</p>
