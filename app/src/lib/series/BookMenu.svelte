<script lang="ts">
  import { Ellipsis, Eye, EyeOff, ListChecks, Play } from "@lucide/svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { moreHeading } from "#lib/reader/more-heading.ts";

  import { bookActions } from "./book-actions";
  import { bookSummary } from "./book-reading";

  const ICON_SIZE = 16;

  let {
    book,
    phone,
    onMark,
    onSelect,
  }: {
    book: SeriesBook;
    phone?: { readonly seriesTitle: string };
    onMark: (mark: ReadMark) => void;
    onSelect?: () => void;
  } = $props();

  const headingId = $props.id();
  const actions = $derived(bookActions(book.reading));
  let isPickingNext = false;

  function startPickingOnceClosed(event: Event): void {
    if (isPickingNext) {
      isPickingNext = false;
      event.preventDefault();
      onSelect?.();
    }
  }
</script>

<DropdownMenu>
  {#if phone !== undefined}
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="plain"
          iconOnly
          label={m.series_book_more({ title: book.title })}
          class="me-xs shrink-0"
        >
          <Icon name="ellipsis" />
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
  {:else}
    <Tooltip label={m.series_book_more_short()}>
      {#snippet child({ props: tip })}
        <DropdownMenuTrigger {...tip}>
          {#snippet child({ props })}
            <Button
              {...props}
              look="row-action"
              aria-label={m.series_book_more({ title: book.title })}
              class="block-pointer-target inline-pointer-target before:block-pointer-target before:inline-pointer-target"
            >
              <Ellipsis size={ICON_SIZE} aria-hidden="true" />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
      {/snippet}
    </Tooltip>
  {/if}
  <DropdownMenuContent
    to="main"
    align="end"
    {...phone === undefined ? {} : { "aria-labelledby": headingId }}
    onCloseAutoFocus={startPickingOnceClosed}
    class="min-inline-book-menu"
  >
    {#if phone !== undefined}
      {@const heading = moreHeading(book.title, phone.seriesTitle)}
      <p
        id={headingId}
        class="flex flex-col px-native-menu-item-inline pbs-xs pbe-2xs text-footnote text-muted contain-inline-size"
      >
        <span class="text-foreground tabular-nums">{bookSummary(book)}</span>
        <span class="flex gap-2xs min-inline-none">
          <span class="truncate">{heading.lead}</span>
          {#if heading.tail !== ""}
            <span class="shrink-0 whitespace-nowrap">{heading.tail}</span>
          {/if}
        </span>
      </p>
    {/if}
    <DropdownMenuItem
      onSelect={() => {
        void goto(resolve("/read/[book]", { book: book.id }));
      }}
    >
      <Play size={ICON_SIZE} aria-hidden="true" />
      {actions.read === "continue"
        ? m.series_continue_reading()
        : m.series_start_reading()}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={() => {
        onMark(actions.mark);
      }}
    >
      {#if actions.mark === "read"}
        <Eye size={ICON_SIZE} aria-hidden="true" />
        {m.series_mark_read()}
      {:else}
        <EyeOff size={ICON_SIZE} aria-hidden="true" />
        {m.series_mark_unread()}
      {/if}
    </DropdownMenuItem>
    {#if onSelect !== undefined}
      <DropdownMenuItem
        onSelect={() => {
          isPickingNext = true;
        }}
      >
        <ListChecks size={ICON_SIZE} aria-hidden="true" />
        {m.series_select()}
      </DropdownMenuItem>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>
