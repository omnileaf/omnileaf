<script lang="ts">
  import { SETTLING_MOTION } from "./back-swipe";
  import type { ScreenCopy } from "./previous-screens";

  interface Area {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  }

  let {
    area,
    copy,
    offset,
    dimming,
    isSettling,
  }: {
    area: Area;
    copy: ScreenCopy | undefined;
    offset: number;
    dimming: number;
    isSettling: boolean;
  } = $props();

  function showCopy(shown: ScreenCopy) {
    return (holder: HTMLElement) => {
      holder.append(shown.content);
      shown.content.scrollTop = shown.scrollTop;
      return () => {
        shown.content.remove();
      };
    };
  }
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
