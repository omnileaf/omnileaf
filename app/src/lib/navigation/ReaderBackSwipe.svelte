<script lang="ts" module>
  export type ReaderBackSwipeState = "off" | "heldForPanning" | "ready";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  import type { SwipeEdge } from "#lib/ipc/bindings.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";

  import { backSwipeEdge, directionOf } from "./back-swipe";
  import ScreenBehindSwipe from "./ScreenBehindSwipe.svelte";
  import { SwipedScreen } from "./swiped-screen.svelte";

  let {
    swipeState,
    takenEdge,
    backPath,
    onBack,
    children,
  }: {
    swipeState: ReaderBackSwipeState;
    takenEdge: SwipeEdge | null;
    backPath: string;
    onBack: () => Promise<void>;
    children: Snippet;
  } = $props();

  const language = getLanguageSetting();
  const swiped = new SwipedScreen({
    isOn: () => swipeState !== "off",
    backPathFrom: () => backPath,
    goBack: () => {
      void onBack().finally(() => {
        swiped.putBack();
      });
      return true;
    },
  });
  const shown = $derived(
    `${swipeState} ${String(takenEdge)} ${language.resolved}`,
  );

  function edgeIn(screen: HTMLElement): SwipeEdge | null {
    const edge = backSwipeEdge(swipeState === "ready", directionOf(screen));
    return edge === takenEdge ? null : edge;
  }

  $effect(() => {
    swiped.allowFor(shown, edgeIn);
  });
</script>

{#if swiped.behind !== undefined}
  <ScreenBehindSwipe {...swiped.behind} />
{/if}
<div
  bind:this={swiped.element}
  class={["fixed inset-none", swiped.look]}
  style:transform={swiped.transform}
>
  {@render children()}
</div>
