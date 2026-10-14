<script lang="ts">
  import { Play } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;

  let { book, class: className }: { book: SeriesBook; class?: string } =
    $props();

  function goOn(book: SeriesBook): string {
    const { reading, title } = book;
    if (reading.state !== "started") {
      return m.series_start({ title });
    }
    return reading.page === null
      ? m.series_continue({ title })
      : m.series_continue_at({ title, page: reading.page });
  }
</script>

<a
  href={resolve("/read/[book]", { book: book.id })}
  class={cn(
    "flex items-center justify-center gap-sm rounded-shadcn-control max-inline-full bg-accent px-lg text-center text-body font-medium text-on-accent transition-control min-block-touch-target hover:bg-accent-hover active:bg-accent-pressed expanded:text-small expanded:min-block-pointer-button",
    className,
  )}
>
  <Play size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
  <span class="truncate">{goOn(book)}</span>
</a>
