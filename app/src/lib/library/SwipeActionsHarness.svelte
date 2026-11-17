<script lang="ts">
  import { RowSwipe } from "#lib/series/row-swipe.svelte.ts";

  import SwipeActions, { type SwipeAction } from "./SwipeActions.svelte";

  let {
    actions,
    dir,
  }: { actions: readonly SwipeAction[]; dir: "ltr" | "rtl" } = $props();

  const swipe = new RowSwipe((side) => side === "towardStart");
</script>

<ul {dir} style:inline-size="358px">
  <li>
    <SwipeActions {swipe} key="Seinen" {actions}>
      <span class="flex items-center min-block-native-row">Seinen</span>
    </SwipeActions>
  </li>
</ul>
