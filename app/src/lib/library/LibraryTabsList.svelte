<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    Ellipsis,
    Eye,
    EyeOff,
    GripVertical,
  } from "@lucide/svelte";
  import { tick } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { NOTICE_WINDOW_MS } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { type ArrangedTab, tabKey } from "./library-tabs.ts";
  import { moved, shownAs } from "./tab-order.ts";

  const ICON_SIZE = 16;
  const BADGE_ICON_SIZE = 12;

  interface Drag {
    readonly key: string;
    readonly order: readonly ArrangedTab[];
  }

  let {
    tabs,
    detailOf,
    onArrange,
  }: {
    tabs: readonly ArrangedTab[];
    detailOf: (tab: ArrangedTab) => string;
    onArrange: (tabs: readonly ArrangedTab[]) => void;
  } = $props();

  let list = $state<HTMLElement | null>(null);
  let drag = $state<Drag | undefined>();
  let announcement = $state("");
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const listed = $derived(drag?.order ?? tabs);

  function announce(text: string): void {
    announcement = text;
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      announcement = "";
    }, NOTICE_WINDOW_MS);
  }

  function announceMove(tab: ArrangedTab, from: number, to: number): void {
    const place = { tab: tab.name, position: to + 1, count: tabs.length };
    announce(
      to < from
        ? m.library_tabs_moved_up(place)
        : m.library_tabs_moved_down(place),
    );
  }

  function handleOf(key: string): HTMLElement | null {
    return (
      list?.querySelector<HTMLElement>(
        `[data-tab-handle="${CSS.escape(key)}"]`,
      ) ?? null
    );
  }

  async function move(from: number, to: number): Promise<void> {
    const tab = tabs[from];
    const next = moved(tabs, from, to);
    if (tab === undefined || next === tabs) {
      return;
    }
    onArrange(next);
    announceMove(tab, from, to);
    await tick();
    handleOf(tabKey(tab.id))?.focus();
  }

  function moveWithKeys(event: KeyboardEvent, at: number): void {
    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!event.altKey || step === undefined) {
      return;
    }
    event.preventDefault();
    void move(at, at + step);
  }

  function startDrag(event: PointerEvent, tab: ArrangedTab): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = { key: tabKey(tab.id), order: tabs };
  }

  function dragTo(event: PointerEvent): void {
    if (drag === undefined || list === null) {
      return;
    }
    const rows = [...list.querySelectorAll<HTMLElement>("[data-tab-row]")];
    const over = rows.findIndex(
      (row) => event.clientY < row.getBoundingClientRect().bottom,
    );
    const { key } = drag;
    const from = drag.order.findIndex(({ id }) => tabKey(id) === key);
    drag = {
      key,
      order: moved(drag.order, from, over === -1 ? rows.length - 1 : over),
    };
  }

  function drop(): void {
    if (drag === undefined) {
      return;
    }
    const { key, order } = drag;
    drag = undefined;
    const from = tabs.findIndex(({ id }) => tabKey(id) === key);
    const to = order.findIndex(({ id }) => tabKey(id) === key);
    const tab = tabs[from];
    if (tab !== undefined && from !== to) {
      onArrange(order);
      announceMove(tab, from, to);
    }
  }
</script>

<ul
  bind:this={list}
  aria-label={m.library_tabs_title()}
  class="flex flex-col divide-y divide-border rounded-card border border-border bg-card"
>
  {#each listed as tab, at (tabKey(tab.id))}
    {@const key = tabKey(tab.id)}
    <li
      data-tab-row
      class={[
        "flex items-center gap-sm py-sm ps-xs pe-sm",
        drag?.key === key &&
          "relative z-drag-box rounded-card bg-card shadow-dialog",
      ]}
    >
      <button
        type="button"
        data-tab-handle={key}
        aria-label={m.library_tabs_move({ tab: tab.name })}
        class="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-muted block-pointer-button inline-pointer-button focus-visible:outline-2 focus-visible:outline-accent touch:block-touch-target touch:inline-touch-target"
        onkeydown={(event) => {
          moveWithKeys(event, at);
        }}
        onpointerdown={(event) => {
          startDrag(event, tab);
        }}
        onpointermove={dragTo}
        onpointerup={drop}
        onpointercancel={drop}
      >
        <GripVertical size={ICON_SIZE} aria-hidden="true" />
      </button>
      <span class="flex flex-1 flex-col gap-2xs min-inline-none">
        <span class="truncate font-medium">{tab.name}</span>
        <span class="text-detail text-muted">{detailOf(tab)}</span>
      </span>
      {#if tab.isHidden}
        <span
          class="flex shrink-0 items-center gap-2xs rounded-full border border-border px-sm text-detail text-muted"
        >
          <EyeOff size={BADGE_ICON_SIZE} aria-hidden="true" />
          {m.library_tabs_hidden()}
        </span>
      {/if}
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props: menuProps })}
            <Tooltip
              label={m.library_tabs_more({ tab: tab.name })}
              {...menuProps}
            >
              {#snippet child({ props })}
                <Button
                  {...props}
                  look="icon"
                  aria-label={m.library_tabs_more({ tab: tab.name })}
                >
                  <Ellipsis size={ICON_SIZE} aria-hidden="true" />
                </Button>
              {/snippet}
            </Tooltip>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={at === 0}
            onSelect={() => {
              void move(at, at - 1);
            }}
          >
            <ArrowUp size={ICON_SIZE} aria-hidden="true" />
            {m.library_tabs_move_up()}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={at === listed.length - 1}
            onSelect={() => {
              void move(at, at + 1);
            }}
          >
            <ArrowDown size={ICON_SIZE} aria-hidden="true" />
            {m.library_tabs_move_down()}
          </DropdownMenuItem>
          {#if tab.id.kind !== "all"}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onArrange(shownAs(tabs, at, tab.isHidden));
              }}
            >
              {#if tab.isHidden}
                <Eye size={ICON_SIZE} aria-hidden="true" />
                {m.library_tabs_show()}
              {:else}
                <EyeOff size={ICON_SIZE} aria-hidden="true" />
                {m.library_tabs_hide()}
              {/if}
            </DropdownMenuItem>
          {/if}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  {/each}
</ul>
<p
  role="status"
  class={announcement === ""
    ? "sr-only"
    : "fixed inset-e-lg inset-be-lg z-notice rounded-control border border-border bg-card px-md py-sm text-small shadow-dialog"}
>
  {announcement}
</p>
