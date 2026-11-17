<script lang="ts">
  import { RowSwipe } from "#lib/series/row-swipe.svelte.ts";
  import type { SwipeSide } from "#lib/series/swipe.ts";

  import SwipeActions, { type SwipeAction } from "./SwipeActions.svelte";

  let {
    actions,
    onFullSwipe,
    canSwipe,
    dir,
  }: {
    actions: readonly SwipeAction[];
    onFullSwipe: (() => void) | undefined;
    canSwipe: (side: SwipeSide) => boolean;
    dir: "ltr" | "rtl";
  } = $props();

  const swipe = new RowSwipe((side) => canSwipe(side));
</script>

<ul {dir} style:inline-size="358px">
  <li>
    <SwipeActions {swipe} key="Seinen" {actions} {onFullSwipe}>
      <span class="flex items-center min-block-native-row">Seinen</span>
    </SwipeActions>
  </li>
</ul>
