<script lang="ts">
  import type { Snippet } from "svelte";

  import type { OpenAction, RowSwipe } from "#lib/series/row-swipe.svelte.ts";

  export interface SwipeAction {
    readonly name: string;
    readonly label: string;
    readonly words: string;
    readonly isDestructive: boolean;
    readonly act: () => void;
  }

  let {
    swipe,
    key,
    actions,
    children,
  }: {
    swipe: RowSwipe;
    key: string;
    actions: readonly SwipeAction[];
    children: Snippet;
  } = $props();

  let strip: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();

  const opensOnActions: OpenAction = {
    revealPx: () => strip?.getBoundingClientRect().width ?? 0,
    actPastOpenPx: 0,
  };

  const isOpen = $derived(swipe.sideOf(key) !== undefined);
</script>

<div class="relative isolate overflow-hidden bg-native-grouped-ground">
  <div
    bind:this={content}
    role="presentation"
    data-swiped
    class={[
      "relative touch-pan-y bg-native-group select-none",
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
    onpointerup={() => {
      swipe.released(opensOnActions);
    }}
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
    bind:this={strip}
    class={[
      "absolute inset-e-none inset-bs-none inset-be-none z-behind flex items-center gap-native-swipe-action-gap pe-native-row-end motion-safe:transition-opacity motion-safe:duration-slide",
      !isOpen && "opacity-0",
    ]}
  >
    {#each actions as { name, label, words, isDestructive, act } (name)}
      <button
        type="button"
        aria-label={label}
        class={[
          "rounded-full px-native-swipe-action-inline text-native-row-title/native-row-title font-native-row-title tracking-native-row-title whitespace-nowrap block-native-swipe-action min-inline-native-swipe-action focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent active:opacity-60",
          isDestructive
            ? "bg-native-swipe-destructive text-native-on-swipe-destructive"
            : "bg-native-button-primary text-native-on-button-primary",
        ]}
        onfocus={() => {
          if (content !== undefined) {
            swipe.reveal(key, "towardStart", content, opensOnActions);
          }
        }}
        onblur={() => {
          if (swipe.isRevealed(key)) {
            swipe.close();
          }
        }}
        onclick={() => {
          swipe.close();
          act();
        }}
      >
        {words}
      </button>
    {/each}
  </div>
</div>
