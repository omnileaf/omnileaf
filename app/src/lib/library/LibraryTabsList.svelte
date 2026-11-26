<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    Ellipsis,
    Eye,
    EyeOff,
    GripVertical,
    Menu,
    Pencil,
    Plus,
    Trash,
  } from "@lucide/svelte";
  import { tick } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import {
    ROW_FOCUS_RING,
    ROW_SUBTITLE_TYPE,
  } from "#lib/components/ui/item/looks.ts";
  import { NOTICE_WINDOW_MS } from "#lib/notices/notices.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { FLUSH_LIST } from "#lib/settings/android-flush-look.ts";
  import { TINTED } from "#lib/settings/setting-row-look.ts";

  import { androidListLook } from "#lib/settings/android-list-look.svelte.ts";
  import { currentPlatform, isPointer } from "#lib/page/platform.ts";

  import { IosPhone } from "./ios-phone.svelte.ts";
  import { type ArrangedTab, tabKey } from "./library-tabs.ts";
  import { RowDrag, type Slot } from "./row-drag.ts";
  import { poseOf, settleRow } from "./settle-row.ts";
  import { moved, shownAs } from "./tab-order.ts";

  const ICON_SIZE = 16;
  const BADGE_ICON_SIZE = 12;
  const ANDROID_BADGE_ICON_SIZE = 14;
  const NO_BUTTONS = 0;
  const ANDROID_BADGE =
    "gap-xs rounded-label-badge bg-chip px-sm py-xs text-caption font-medium tracking-native-row-title";

  interface Drag {
    readonly key: string;
    readonly pointerId: number;
    readonly rowCount: number;
    readonly rows: RowDrag;
  }

  interface Settling {
    readonly key: string;
    readonly easesNeighbours: boolean;
  }

  let {
    tabs,
    detailOf,
    onArrange,
    onNewCategory,
    onRename,
    onDelete,
  }: {
    tabs: readonly ArrangedTab[];
    detailOf: (tab: ArrangedTab) => string;
    onArrange: (tabs: readonly ArrangedTab[]) => void;
    onNewCategory?: (() => void) | undefined;
    onRename?: ((tab: ArrangedTab) => void) | undefined;
    onDelete?: ((tab: ArrangedTab) => void) | undefined;
  } = $props();

  const android = androidListLook();
  const ios = new IosPhone();
  const isDesktopLook = $derived(!android.isOn && !ios.isOn);
  const isMac = currentPlatform() === "macos";
  const asksFirst = isPointer(currentPlatform());
  const rowLook = $derived(
    android.isOn
      ? "gap-xs ps-xs pe-md min-block-native-row-two"
      : ios.isOn
        ? "gap-sm ps-lg pe-xs min-block-native-row"
        : "gap-sm py-sm ps-xs pe-sm min-block-row",
  );
  const leadingSlotLook = $derived(
    android.isOn
      ? "native-target block-native-button inline-native-button"
      : "block-pointer-button inline-pointer-button touch:block-touch-target touch:inline-touch-target",
  );
  const nameLook = $derived([
    "truncate",
    android.isOn && "text-body tracking-native-row-title",
    ios.isOn &&
      "text-native-row-title/native-row-title tracking-native-row-title",
    isDesktopLook && "font-medium",
  ]);
  const IOS_ICON_SIZE = 20;
  let list = $state<HTMLElement | null>(null);
  let drag = $state<Drag | undefined>();
  let settling = $state<Settling | undefined>();
  let announcement = $state("");
  let quiet: ReturnType<typeof setTimeout> | undefined;

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

  function rowOf(key: string): HTMLElement | null {
    return (
      list?.querySelector<HTMLElement>(`[data-tab-row="${CSS.escape(key)}"]`) ??
      null
    );
  }

  function listTop(): number {
    return list?.getBoundingClientRect().top ?? 0;
  }

  function slotsOfRows(): Slot[] {
    const origin = listTop();
    return [
      ...(list?.querySelectorAll<HTMLElement>("[data-tab-row]") ?? []),
    ].map((row) => {
      const { top, height } = row.getBoundingClientRect();
      return { top: top - origin, height };
    });
  }

  function finishSettling(): void {
    for (const animation of list?.getAnimations({ subtree: true }) ?? []) {
      animation.finish();
    }
    settling = undefined;
  }

  function isUnderTheDrag({ key, rowCount, rows }: Drag): boolean {
    const tab = tabs[rows.from];
    return (
      tabs.length === rowCount && tab !== undefined && tabKey(tab.id) === key
    );
  }

  $effect.pre(() => {
    if (drag !== undefined && !isUnderTheDrag(drag)) {
      void endDrag(false);
    }
  });

  function isDragPointer(event: PointerEvent): boolean {
    return drag?.pointerId === event.pointerId;
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
    if (!event.altKey || step === undefined || drag !== undefined) {
      return;
    }
    event.preventDefault();
    void move(at, at + step);
  }

  function startDrag(event: PointerEvent, at: number): void {
    const tab = tabs[at];
    if (event.button !== 0 || tab === undefined || drag !== undefined) {
      return;
    }
    event.preventDefault();
    finishSettling();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = {
      key: tabKey(tab.id),
      pointerId: event.pointerId,
      rowCount: tabs.length,
      rows: new RowDrag(at, slotsOfRows(), event.clientY - listTop()),
    };
  }

  function dragTo(event: PointerEvent): void {
    if (drag === undefined || !isDragPointer(event)) {
      return;
    }
    if (event.buttons === NO_BUTTONS) {
      void endDrag(true);
      return;
    }
    drag = { ...drag, rows: drag.rows.to(event.clientY - listTop()) };
  }

  async function endDrag(keepsGap: boolean): Promise<void> {
    if (drag === undefined) {
      return;
    }
    const { key, rows } = drag;
    const tab = tabs[rows.from];
    const isMoved =
      keepsGap &&
      tab !== undefined &&
      tabKey(tab.id) === key &&
      rows.gap !== rows.from;
    const liftedRow = rowOf(key);
    const lifted = liftedRow === null ? undefined : poseOf(liftedRow);
    settling = { key, easesNeighbours: !isMoved };
    drag = undefined;
    if (isMoved) {
      onArrange(moved(tabs, rows.from, rows.gap));
      announceMove(tab, rows.from, rows.gap);
    }
    try {
      await tick();
      const row = rowOf(key);
      const settle =
        row === null || lifted === undefined
          ? undefined
          : settleRow(row, lifted);
      await settle?.finished.then(
        () => undefined,
        () => undefined,
      );
    } finally {
      stopSettling(key);
    }
  }

  function stopSettling(key: string): void {
    if (settling?.key === key) {
      settling = undefined;
    }
  }

  function drop(event: PointerEvent): void {
    if (isDragPointer(event)) {
      void endDrag(true);
    }
  }

  function cancelDrag(event: PointerEvent): void {
    if (isDragPointer(event)) {
      void endDrag(false);
    }
  }

  function cancelDragWhenHidden(): void {
    if (document.visibilityState === "hidden") {
      void endDrag(false);
    }
  }
</script>

<svelte:document onvisibilitychange={cancelDragWhenHidden} />
<svelte:window
  onblur={() => {
    void endDrag(false);
  }}
/>

<div
  data-settings-group
  class={android.isOn
    ? FLUSH_LIST
    : ios.isOn
      ? `flex flex-col divide-y divide-ios-separator overflow-hidden ${GROUP_PLATE}`
      : "flex flex-col divide-y divide-border rounded-card border border-border bg-card"}
>
  <ul
    bind:this={list}
    aria-label={isMac ? m.library_tabs_title_mac() : m.library_tabs_title()}
    class={[
      "flex flex-col",
      ios.isOn && "divide-y divide-ios-separator",
      isDesktopLook && "divide-y divide-border",
    ]}
  >
    {#each tabs as tab, at (tabKey(tab.id))}
      {@const key = tabKey(tab.id)}
      {@const isLifted = drag?.key === key}
      {@const isRaised = isLifted || settling?.key === key}
      <li
        data-tab-row={key}
        style:inset-block-start={isLifted
          ? `${String(drag?.rows.offset ?? 0)}px`
          : undefined}
        style:translate={drag !== undefined && !isLifted
          ? `0 ${String(drag.rows.shiftOf(at))}px`
          : undefined}
        class={[
          "flex items-center",
          rowLook,
          !isRaised &&
            (drag !== undefined || settling?.easesNeighbours === true) &&
            "transition-transform duration-move ease-emphasized",
          isRaised &&
            (android.isOn
              ? "relative z-drag-box rounded-native-segment bg-android-container-high"
              : "relative z-drag-box rounded-card bg-card"),
          isLifted &&
            (android.isOn
              ? "-translate-y-native-drag-lift shadow-dialog"
              : "shadow-dialog"),
        ]}
      >
        <button
          type="button"
          data-tab-handle={key}
          aria-label={m.library_tabs_move({ tab: tab.name })}
          class={[
            "flex shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-muted focus-visible:outline-2 focus-visible:outline-accent",
            leadingSlotLook,
            ios.isOn && "order-last",
          ]}
          onkeydown={(event) => {
            moveWithKeys(event, at);
          }}
          onpointerdown={(event) => {
            startDrag(event, at);
          }}
          onpointermove={dragTo}
          onpointerup={drop}
          onlostpointercapture={drop}
          onpointercancel={cancelDrag}
        >
          {#if ios.isOn}
            <Menu size={IOS_ICON_SIZE} aria-hidden="true" />
          {:else if android.isOn}
            <Icon name="grip-vertical" />
          {:else}
            <GripVertical size={ICON_SIZE} aria-hidden="true" />
          {/if}
        </button>
        <span
          class={[
            "flex flex-1 flex-col min-inline-none",
            android.isOn ? "ps-xs" : "gap-2xs",
          ]}
        >
          <span class={nameLook}>{tab.name}</span>
          <span
            class={[
              "text-muted",
              android.isOn || ios.isOn ? ROW_SUBTITLE_TYPE : "text-detail",
            ]}
          >
            {detailOf(tab)}
          </span>
        </span>
        {#if tab.isHidden}
          <span
            data-tab-badge
            class={[
              "flex shrink-0 items-center text-muted",
              android.isOn
                ? ANDROID_BADGE
                : [
                    "gap-2xs text-detail",
                    !ios.isOn && "rounded-full border border-border px-sm",
                  ],
            ]}
          >
            {#if android.isOn}
              <Icon name="eye-off" size={ANDROID_BADGE_ICON_SIZE} />
            {:else if !ios.isOn}
              <EyeOff size={BADGE_ICON_SIZE} aria-hidden="true" />
            {/if}
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
                    data-tab-more
                    look="icon"
                    class={[
                      android.isOn &&
                        "native-target block-native-button inline-native-button",
                      ios.isOn && "block-native-button inline-native-button",
                    ]}
                    aria-label={m.library_tabs_more({ tab: tab.name })}
                  >
                    {#if android.isOn}
                      <Icon name="ellipsis" />
                    {:else}
                      <Ellipsis
                        size={ios.isOn ? IOS_ICON_SIZE : ICON_SIZE}
                        aria-hidden="true"
                      />
                    {/if}
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
              disabled={at === tabs.length - 1}
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
                  {isMac ? m.library_tabs_show_mac() : m.library_tabs_show()}
                {:else}
                  <EyeOff size={ICON_SIZE} aria-hidden="true" />
                  {isMac ? m.library_tabs_hide_mac() : m.library_tabs_hide()}
                {/if}
              </DropdownMenuItem>
            {/if}
            {#if tab.id.kind === "category" && onRename !== undefined && onDelete !== undefined}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  onRename(tab);
                }}
              >
                <Pencil size={ICON_SIZE} aria-hidden="true" />
                {asksFirst
                  ? m.library_tabs_rename_ask()
                  : m.library_tabs_rename()}
              </DropdownMenuItem>
              <DropdownMenuItem
                tone="danger"
                onSelect={() => {
                  onDelete(tab);
                }}
              >
                <Trash size={ICON_SIZE} aria-hidden="true" />
                {asksFirst
                  ? m.library_tabs_delete_ask()
                  : m.library_tabs_delete()}
              </DropdownMenuItem>
            {/if}
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    {/each}
  </ul>
  {#if onNewCategory !== undefined}
    <button
      type="button"
      class={[
        "flex items-center text-start transition-control inline-full",
        rowLook,
        TINTED,
        ROW_FOCUS_RING,
        isDesktopLook && "rounded-ee-card rounded-es-card",
      ]}
      onclick={onNewCategory}
    >
      <span
        class={[
          "flex shrink-0 items-center justify-center text-muted",
          leadingSlotLook,
          ios.isOn && "order-last",
        ]}
      >
        {#if android.isOn}
          <Icon name="plus" />
        {:else}
          <Plus
            size={ios.isOn ? IOS_ICON_SIZE : ICON_SIZE}
            aria-hidden="true"
          />
        {/if}
      </span>
      <span class={["flex-1", android.isOn && "ps-xs", nameLook]}>
        {isMac
          ? m.library_tabs_new_category_mac()
          : m.library_tabs_new_category()}
      </span>
    </button>
  {/if}
</div>
<p role="status" class="sr-only">{announcement}</p>
