<script lang="ts">
  import { Popover } from "bits-ui";
  import type { Snippet } from "svelte";

  import { PopoverContent } from "#lib/components/ui/popover/index.ts";

  import type { ViewPanelLook } from "./view-panel";

  let {
    isOpen = $bindable(false),
    opener,
    title,
    panel,
    action,
    children,
  }: {
    isOpen?: boolean;
    opener: HTMLElement | null;
    title: string;
    panel: ViewPanelLook;
    action?: Snippet;
    children: Snippet;
  } = $props();

  const titleId = $props.id();
  const titleRow: Snippet = heading;

  let direction: "ltr" | "rtl" = $state("ltr");
  let content: HTMLElement | null = $state(null);

  $effect.pre(() => {
    if (isOpen && opener !== null) {
      direction = getComputedStyle(opener).direction === "rtl" ? "rtl" : "ltr";
    }
  });

  function keepFocusOffAction(event: Event): void {
    if (action === undefined) {
      return;
    }
    event.preventDefault();
    content?.focus();
  }

  function focusOpener(event: Event): void {
    event.preventDefault();
    opener?.focus();
  }
</script>

{#snippet heading()}
  <h2 id={titleId} class={panel.title}>{title}</h2>
{/snippet}

<Popover.Root bind:open={isOpen}>
  <PopoverContent
    bind:ref={content}
    tabindex={-1}
    customAnchor={opener}
    dir={direction}
    align="end"
    aria-labelledby={titleId}
    class={[
      "flex flex-col overflow-auto outline-none max-block-(--bits-popover-content-available-height)",
      panel.surface,
      panel.width,
    ]}
    onOpenAutoFocus={keepFocusOffAction}
    onCloseAutoFocus={focusOpener}
  >
    {#if action}
      <div class="flex items-center justify-between">
        {@render titleRow()}
        {@render action()}
      </div>
    {:else}
      {@render titleRow()}
    {/if}
    {@render children()}
  </PopoverContent>
</Popover.Root>
