<script lang="ts">
  import { onMount, tick } from "svelte";

  import { scrollerOf } from "#lib/virtual-grid/scroller.ts";

  const SCREENS_FOR_A_HANDLE = 8;
  const EDGE_GAP_PX = 2;
  const MOST_OF_THE_SCREEN_ABOVE_THE_TRACK = 0.4;

  interface Frame {
    readonly top: number;
    readonly height: number;
    readonly end: number;
  }

  let {
    total,
    letterAt,
  }: {
    total: number | undefined;
    letterAt: (fraction: number) => string | undefined;
  } = $props();

  let anchor = $state<HTMLElement | null>(null);
  let handle = $state<HTMLElement | null>(null);
  let scroller: Element | undefined;
  let frame = $state<Frame | undefined>();
  let fraction = $state(0);
  let isLong = $state(false);
  let grabbedAt = $state<number | undefined>();
  let letter = $state<string | undefined>();
  const handleTop = $derived(
    frame === undefined
      ? 0
      : frame.top +
          fraction * Math.max(0, frame.height - (handle?.offsetHeight ?? 0)),
  );

  $effect(() => {
    if (total !== undefined) {
      void tick().then(follow);
    }
  });

  $effect(() => {
    if (grabbedAt === undefined) {
      return;
    }
    const now = letterAt(fraction);
    if (now !== undefined) {
      letter = now;
    }
  });

  function follow(): void {
    if (scroller === undefined || anchor === null) {
      return;
    }
    const range = scroller.scrollHeight - scroller.clientHeight;
    const box = scroller.getBoundingClientRect();
    const isPage = scroller === document.scrollingElement;
    const top = isPage ? 0 : box.top;
    const coversTop =
      anchor.getBoundingClientRect().top - top + scroller.scrollTop;
    const aboveTrack = Math.min(
      Math.max(0, coversTop),
      scroller.clientHeight * MOST_OF_THE_SCREEN_ABOVE_THE_TRACK,
    );
    isLong =
      scroller.scrollHeight >= scroller.clientHeight * SCREENS_FOR_A_HANDLE;
    if (grabbedAt === undefined) {
      fraction = range <= 0 ? 0 : scroller.scrollTop / range;
    }
    frame = {
      top: top + aboveTrack,
      height: scroller.clientHeight - aboveTrack,
      end: isPage ? 0 : document.documentElement.clientWidth - box.right,
    };
  }

  function grab(event: PointerEvent): void {
    if (event.button !== 0 || handle === null) {
      return;
    }
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    grabbedAt = event.clientY - handle.getBoundingClientRect().top;
  }

  function drag(event: PointerEvent): void {
    if (
      grabbedAt === undefined ||
      scroller === undefined ||
      frame === undefined ||
      handle === null
    ) {
      return;
    }
    const travel = frame.height - handle.offsetHeight;
    const next = Math.min(
      1,
      Math.max(0, (event.clientY - grabbedAt - frame.top) / travel),
    );
    fraction = next;
    scroller.scrollTop = next * (scroller.scrollHeight - scroller.clientHeight);
  }

  function drop(): void {
    grabbedAt = undefined;
    letter = undefined;
  }

  onMount(() => {
    if (anchor === null) {
      return;
    }
    scroller = scrollerOf(anchor);
    follow();
    const target = scroller === document.scrollingElement ? document : scroller;
    target.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("resize", follow, { passive: true });
    return () => {
      target.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
    };
  });
</script>

<span bind:this={anchor} class="block"></span>
{#if isLong && frame !== undefined}
  <div
    bind:this={handle}
    data-fast-scroll-handle
    aria-hidden="true"
    class="fixed z-series-bar flex cursor-grab touch-none justify-end block-fast-scroll-thumb-length inline-fast-scroll-hit"
    style:inset-block-start="{handleTop}px"
    style:inset-inline-end="{frame.end + EDGE_GAP_PX}px"
    onpointerdown={grab}
    onpointermove={drag}
    onpointerup={drop}
    onpointercancel={drop}
  >
    <span
      class="rounded-full bg-muted block-fast-scroll-thumb-length inline-fast-scroll-thumb"
    ></span>
  </div>
  {#if grabbedAt !== undefined && letter !== undefined}
    <span
      data-fast-scroll-letter
      aria-hidden="true"
      class="fixed z-series-bar flex items-center justify-center rounded-full bg-foreground text-title font-bold text-card block-fast-scroll-letter inline-fast-scroll-letter"
      style:inset-block-start="{handleTop}px"
      style:inset-inline-end="calc({frame.end + EDGE_GAP_PX}px +
      var(--spacing-fast-scroll-hit))"
    >
      {letter}
    </span>
  {/if}
{/if}
