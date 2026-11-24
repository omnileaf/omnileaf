<script lang="ts">
  import { SETTLING_MOTION } from "./back-swipe";
  import {
    type ScreenArea,
    type ScreenCopy,
    showCopy,
  } from "./previous-screens";

  let {
    area,
    copy,
    offset,
    dimming,
    isSettling,
  }: {
    area: ScreenArea;
    copy: ScreenCopy | undefined;
    offset: number;
    dimming: number;
    isSettling: boolean;
  } = $props();
</script>

<div
  aria-hidden="true"
  inert
  data-previous-screen
  class="fixed overflow-hidden bg-background"
  style:left="{area.left}px"
  style:top="{area.top}px"
  style:width="{area.width}px"
  style:height="{area.height}px"
>
  <div
    class={[
      "flex flex-col block-full inline-full",
      isSettling && ["transition-transform", SETTLING_MOTION],
    ]}
    style:transform="translateX({offset}%)"
  >
    {#if copy !== undefined}
      <div class="contents" {@attach showCopy(copy)}></div>
    {/if}
  </div>
  <div
    class={[
      "absolute inset-none bg-native-scrim",
      isSettling && ["transition-opacity", SETTLING_MOTION],
    ]}
    style:opacity={dimming}
  ></div>
</div>
