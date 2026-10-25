<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import PageHeading from "#lib/page/PageHeading.svelte";
  import { isPhone } from "#lib/page/platform.ts";
  import PageToolbar from "#lib/page/PageToolbar.svelte";
  import { NATIVE_TOP_BAR } from "#lib/page/top-bar.ts";

  import ScreenshotModeLabel from "./ScreenshotModeLabel.svelte";

  interface Props {
    readonly title: string;
    readonly showsLabel: boolean;
    readonly count?: Snippet | undefined;
    readonly attention?: Snippet | undefined;
    readonly actions?: Snippet;
    readonly platform: Platform;
  }

  let { title, showsLabel, count, attention, actions, platform }: Props =
    $props();

  const width = new WindowWidth();
  const hasLargeTitle = $derived(
    platform === "ios" && isPhone(platform, width.current),
  );
  let bar = $state<HTMLElement | null>(null);
  let isTitleUnderBar = $state(false);

  $effect(() => {
    const heading = header?.querySelector("h1");
    if (!hasLargeTitle || bar === null || heading == null) {
      return;
    }
    const barBottom = bar.getBoundingClientRect().bottom;
    const watching = new IntersectionObserver(
      ([seen]) => {
        if (seen !== undefined) {
          isTitleUnderBar =
            !seen.isIntersecting &&
            seen.boundingClientRect.bottom <= (seen.rootBounds?.top ?? 0);
        }
      },
      { rootMargin: `${String(-barBottom)}px 0px 0px 0px` },
    );
    watching.observe(heading);
    return () => {
      watching.disconnect();
    };
  });

  const FITS = ["roomy", "crowded", "stacked"] as const;

  let header: HTMLElement | undefined = $state();
  let buttons = $state<HTMLElement | null>(null);
  let fitIndex = $state(0);
  const roomNeeded: number[] = [];
  let fittedButtons = 0;

  const fitting = $derived(FITS[fitIndex]);

  function refit(heading: HTMLElement): boolean {
    const fitted = fitIndex;
    const buttonCount = buttons?.childElementCount ?? 0;
    if (buttonCount !== fittedButtons) {
      fittedButtons = buttonCount;
      roomNeeded.length = 0;
      fitIndex = 0;
    }
    if (getComputedStyle(heading).display !== "grid") {
      fitIndex = 0;
      return fitIndex !== fitted;
    }
    const overflows = heading.scrollWidth > heading.clientWidth;
    const regained = roomNeeded[fitIndex - 1] ?? Number.POSITIVE_INFINITY;
    if (overflows && fitIndex < FITS.length - 1) {
      roomNeeded[fitIndex] = heading.scrollWidth;
      fitIndex += 1;
    } else if (fitIndex > 0 && heading.clientWidth >= regained) {
      fitIndex -= 1;
    }
    return fitIndex !== fitted;
  }

  $effect(() => {
    if (header === undefined) {
      return;
    }
    const heading = header;
    let pendingFit: number | undefined;
    const fitSoon = (): void => {
      pendingFit ??= requestAnimationFrame(() => {
        pendingFit = undefined;
        if (refit(heading)) {
          fitSoon();
        }
      });
    };
    const observer = new ResizeObserver(fitSoon);
    observer.observe(heading);
    if (buttons !== null) {
      observer.observe(buttons);
    }
    return () => {
      if (pendingFit !== undefined) {
        cancelAnimationFrame(pendingFit);
      }
      observer.disconnect();
    };
  });
</script>

{#if hasLargeTitle && actions !== undefined}
  <div
    bind:this={bar}
    data-title-bar
    class={[
      "sticky -inset-bs-page-top z-series-bar -ms-page-start -me-page-end -mbs-page-top flex items-center pe-page-end pbs-page-top pbe-xs motion-safe:transition-colors motion-safe:duration-fade",
      NATIVE_TOP_BAR.edge,
      isTitleUnderBar ? NATIVE_TOP_BAR.scrolled : "border-transparent",
    ]}
  >
    <span
      aria-hidden="true"
      class={[
        "pointer-events-none flex-1 truncate px-sm text-center min-inline-none motion-safe:transition-opacity motion-safe:duration-fade",
        NATIVE_TOP_BAR.barTitle,
        isTitleUnderBar ? "opacity-100" : "opacity-0",
      ]}
    >
      {title}
    </span>
    <div class="flex shrink-0 items-center gap-md">
      {@render actions()}
    </div>
  </div>
{/if}
<PageToolbar
  class={isPhone(platform, width.current)
    ? `@container text-body ${NATIVE_TOP_BAR.lift}`
    : "@container text-body"}
>
  <header
    bind:this={header}
    data-crowded={fitting !== "roomy" || undefined}
    data-stacked={fitting === "stacked" || undefined}
    class="grid grid-cols-collection-heading items-center heading-two-rows:flex heading-two-rows:flex-wrap heading-two-rows:gap-x-title-count heading-two-rows:gap-y-2xs in-toolbar:flex in-toolbar:flex-1 in-toolbar:gap-sm in-toolbar:min-inline-none"
  >
    <div
      class="col-start-1 row-start-1 flex flex-wrap items-baseline gap-x-title-count heading-two-rows:contents in-toolbar:flex-nowrap in-toolbar:min-inline-none"
    >
      <div
        class={[
          "heading-two-rows:order-1 heading-stacked:basis-full in-toolbar:min-inline-none",
          attention !== undefined && "flex items-center",
        ]}
      >
        <PageHeading {title} />
        {@render attention?.()}
      </div>
      {#if count !== undefined}
        <div
          class="heading-two-rows:order-4 heading-two-rows:touch:ps-xs heading-crowded:basis-full in-toolbar:min-inline-none"
        >
          {@render count()}
        </div>
      {/if}
    </div>
    <div
      aria-hidden="true"
      class="hidden heading-two-rows:order-3 heading-two-rows:block heading-two-rows:basis-full"
    ></div>
    {#if showsLabel}
      <div
        class={[
          "flex justify-self-start text-nowrap heading-one-row:col-span-full heading-one-row:row-start-2 heading-one-row:mbs-md heading-two-rows:order-5 heading-label-inline:col-start-2 heading-label-inline:row-start-1 heading-label-inline:ms-title-count heading-label-inline:ps-xs heading-label-below:col-span-full heading-label-below:row-start-2 heading-label-below:mbs-md heading-crowded:col-span-full heading-crowded:col-start-1 heading-crowded:row-start-2 heading-crowded:ms-none heading-crowded:mbs-md heading-crowded:ps-none in-toolbar:shrink-0",
          count === undefined && "heading-two-rows:touch:ps-xs",
        ]}
      >
        <ScreenshotModeLabel />
      </div>
    {/if}
    {#if actions !== undefined && !hasLargeTitle}
      <div
        bind:this={buttons}
        class="col-start-4 row-start-1 ms-title-count flex items-center justify-self-end medium:gap-sm heading-two-rows:order-2 heading-two-rows:ms-auto heading-stacked:order-6 heading-stacked:col-span-full heading-stacked:col-start-1 heading-stacked:row-start-auto heading-stacked:mbs-sm heading-stacked:basis-full heading-stacked:justify-end in-toolbar:ms-auto in-toolbar:shrink-0"
      >
        {@render actions()}
      </div>
    {/if}
  </header>
</PageToolbar>
