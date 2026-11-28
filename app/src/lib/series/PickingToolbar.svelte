<script lang="ts">
  import { Portal } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { ReadMark } from "#lib/ipc/bindings.ts";
  import {
    DOCKED_BAR_TOAST_ROOM,
    makesToastRoom,
  } from "#lib/notices/toast-room.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { PhonePicking } from "./phone-picking";

  const MARKS = [
    { mark: "read", glyph: "eye", label: m.series_mark_read },
    { mark: "unread", glyph: "eye-off", label: m.series_mark_unread },
  ] as const;

  let {
    picking,
    count,
    onMark,
    onDelete,
    element = $bindable(),
  }: {
    picking: PhonePicking;
    count: number;
    onMark: (mark: ReadMark) => void;
    onDelete?: (() => void) | undefined;
    element?: HTMLElement | undefined;
  } = $props();

  let toolbarHeight = $state(0);
  const iconOnly = (label: string) =>
    picking.isIconOnly ? { iconOnly: true as const, label } : {};
</script>

<Portal>
  <div
    bind:this={element}
    role="group"
    aria-label={m.series_selection_toolbar()}
    bind:offsetHeight={toolbarHeight}
    class={picking.toolbar}
    {@attach picking.isDocked && makesToastRoom(DOCKED_BAR_TOAST_ROOM)}
  >
    <div class={picking.toolbarRow}>
      {#each MARKS as { mark, glyph, label } (mark)}
        <Button
          type="button"
          variant="plain"
          {...iconOnly(label())}
          disabled={count === 0}
          class={picking.action}
          onclick={() => {
            onMark(mark);
          }}
        >
          <Icon name={glyph} />
          {#if !picking.isIconOnly}
            {label()}
          {/if}
        </Button>
      {/each}
      {#if onDelete !== undefined}
        <Button
          type="button"
          variant="plain"
          {...iconOnly(m.library_delete())}
          disabled={count === 0}
          class={picking.action}
          onclick={onDelete}
        >
          <Icon name="trash" />
          {#if !picking.isIconOnly}
            {m.library_delete()}
          {/if}
        </Button>
      {/if}
    </div>
  </div>
</Portal>
{#if picking.isDocked}
  <Portal to="main">
    <div
      aria-hidden="true"
      class="shrink-0"
      style:block-size="{toolbarHeight}px"
    ></div>
  </Portal>
{/if}
