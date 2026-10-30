<script lang="ts">
  import type { Snippet } from "svelte";

  import { m } from "#lib/paraglide/messages.js";
  import type { OpenAction, RowSwipe } from "#lib/series/row-swipe.svelte.ts";

  let {
    swipe,
    key,
    label,
    onRemove,
    children,
  }: {
    swipe: RowSwipe;
    key: string;
    label: string;
    onRemove: () => void;
    children: Snippet;
  } = $props();

  let actions: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();

  const opensOnRemove: OpenAction = {
    revealPx: () => actions?.getBoundingClientRect().width ?? 0,
    actPastOpenPx: 0,
  };

  const isOpen = $derived(swipe.sideOf(key) !== undefined);

  function released(): void {
    if (swipe.released(opensOnRemove).kind === "act") {
      onRemove();
    }
  }
</script>

<div class="relative isolate overflow-hidden bg-native-grouped-ground">
  <div
    bind:this={content}
    role="presentation"
    data-swiped
    class={[
      "relative touch-pan-y bg-native-group select-none",
      isOpen && "rounded-full",
      !swipe.isDragging &&
        "motion-safe:transition-transform motion-safe:duration-slide",
    ]}
    style:translate="{swipe.offsetOf(key)}px 0"
    onpointerdown={(event) => {
      if (event.currentTarget instanceof HTMLElement) {
        swipe.pressed(event, key, event.currentTarget);
      }
    }}
    onpointermove={(event) => {
      swipe.moved(event);
    }}
    onpointerup={released}
    onpointercancel={() => {
      swipe.cancelled();
    }}
    onclickcapture={(event) => {
      swipe.clicked(event, key);
    }}
  >
    {@render children()}
  </div>
  <div
    bind:this={actions}
    class={[
      "absolute inset-e-none inset-bs-none inset-be-none z-behind flex ps-native-swipe-action-gap pe-native-row-end motion-safe:transition-opacity motion-safe:duration-slide",
      !isOpen && "opacity-0",
    ]}
  >
    <button
      type="button"
      aria-label={label}
      class="rounded-full bg-native-swipe-destructive px-native-swipe-action-inline text-native-row-title/native-row-title font-native-row-title tracking-native-row-title whitespace-nowrap text-native-on-swipe-destructive min-inline-native-swipe-action focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent active:opacity-60"
      onfocus={() => {
        if (content !== undefined) {
          swipe.reveal(key, "towardStart", content, opensOnRemove);
        }
      }}
      onblur={() => {
        if (swipe.isRevealed(key)) {
          swipe.close();
        }
      }}
      onclick={() => {
        swipe.close();
        onRemove();
      }}
    >
      {m.library_remove_folder_swipe()}
    </button>
  </div>
</div>
