<script lang="ts">
  import { Play } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { buttonClasses } from "#lib/components/ui/button/looks.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import { phoneAction } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;
  const TODAYS_LOOK =
    "flex items-center justify-center gap-sm rounded-shadcn-button bg-accent px-lg text-center text-body font-medium text-on-accent transition-control max-inline-full min-block-touch-target hover:bg-accent-hover active:bg-accent-pressed expanded:text-small expanded:min-block-pointer-button ios:rounded-ios-button ios:min-block-ios-control";

  let { book, class: className }: { book: SeriesBook; class?: string } =
    $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const look = $derived.by(() => {
    const phone = phoneAction(platform, width.current, "main");
    return phone === undefined
      ? TODAYS_LOOK
      : buttonClasses("primary", platform, {
          variant: phone.variant,
          size: phone.size,
        });
  });

  function goOn(book: SeriesBook): string {
    const { reading, title } = book;
    if (reading.state !== "started") {
      return m.series_start({ title });
    }
    return reading.page === null
      ? m.series_continue({ title })
      : m.series_continue_at({ title, page: reading.page });
  }

  function shortLabel(book: SeriesBook): string {
    return book.reading.state === "started"
      ? m.series_continue_short()
      : m.series_start({ title: book.title });
  }
</script>

<a
  href={resolve("/read/[book]", { book: book.id })}
  aria-label={goOn(book)}
  class={cn(look, className)}
>
  <Play size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
  <span class="truncate">{shortLabel(book)}</span>
</a>
