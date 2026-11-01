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

  let direction: "ltr" | "rtl" = $state("ltr");

  $effect.pre(() => {
    if (isOpen && opener !== null) {
      direction = getComputedStyle(opener).direction === "rtl" ? "rtl" : "ltr";
    }
  });

  function focusOpener(event: Event): void {
    event.preventDefault();
    opener?.focus();
  }
</script>

<Popover.Root bind:open={isOpen}>
  <PopoverContent
    customAnchor={opener}
    dir={direction}
    align="end"
    aria-labelledby={titleId}
    class={[
      "flex flex-col overflow-auto max-block-full",
      panel.surface,
      panel.width,
    ]}
    onCloseAutoFocus={focusOpener}
  >
    <div class="flex items-center justify-between">
      <h2 id={titleId} class={panel.title}>{title}</h2>
      {#if action}
        {@render action()}
      {/if}
    </div>
    {@render children()}
  </PopoverContent>
</Popover.Root>
