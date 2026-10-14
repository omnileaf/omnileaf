<script lang="ts">
  import type { Snippet } from "svelte";

  import SidebarToggle from "#lib/navigation/SidebarToggle.svelte";
  import PageHeading from "#lib/page/PageHeading.svelte";

  import ScreenshotModeLabel from "./ScreenshotModeLabel.svelte";

  interface Props {
    readonly title: string;
    readonly showsLabel: boolean;
    readonly count?: Snippet | undefined;
    readonly actions?: Snippet;
  }

  let { title, showsLabel, count, actions }: Props = $props();

  const FITS = ["roomy", "crowded", "stacked"] as const;

  let header: HTMLElement | undefined = $state();
  let buttons: HTMLElement | undefined = $state();
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
    if (buttons !== undefined) {
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

<div
  data-page-toolbar
  class="@container text-body in-toolbar:sticky in-toolbar:-inset-bs-title-gap in-toolbar:z-series-bar in-toolbar:-ms-gutter in-toolbar:-me-page-end in-toolbar:-mbs-title-gap in-toolbar:flex in-toolbar:items-center in-toolbar:border-be in-toolbar:border-border in-toolbar:bg-background in-toolbar:px-lg in-toolbar:min-block-toolbar"
>
  <div class="hidden items-center gap-sm in-toolbar:me-sm in-toolbar:flex">
    <SidebarToggle />
    <span
      aria-hidden="true"
      class="me-sm border-s border-border block-toolbar-rule"
    ></span>
  </div>
  <header
    bind:this={header}
    data-crowded={fitting !== "roomy" || undefined}
    data-stacked={fitting === "stacked" || undefined}
    class="grid grid-cols-collection-heading items-center heading-two-rows:flex heading-two-rows:flex-wrap heading-two-rows:gap-x-title-count heading-two-rows:gap-y-2xs in-toolbar:flex in-toolbar:flex-1 in-toolbar:gap-sm"
  >
    <div
      class="col-start-1 row-start-1 flex flex-wrap items-baseline gap-x-title-count heading-two-rows:contents"
    >
      <div class="heading-two-rows:order-1 heading-stacked:basis-full">
        <PageHeading {title} />
      </div>
      {#if count !== undefined}
        <div
          class="heading-two-rows:order-4 heading-two-rows:touch:ps-xs heading-crowded:basis-full"
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
          "flex justify-self-start text-nowrap heading-one-row:col-span-full heading-one-row:row-start-2 heading-one-row:mbs-md heading-two-rows:order-5 heading-label-inline:col-start-2 heading-label-inline:row-start-1 heading-label-inline:ms-title-count heading-label-inline:ps-xs heading-label-below:col-span-full heading-label-below:row-start-2 heading-label-below:mbs-md heading-crowded:col-span-full heading-crowded:col-start-1 heading-crowded:row-start-2 heading-crowded:ms-none heading-crowded:mbs-md heading-crowded:ps-none",
          count === undefined && "heading-two-rows:touch:ps-xs",
        ]}
      >
        <ScreenshotModeLabel />
      </div>
    {/if}
    {#if actions !== undefined}
      <div
        bind:this={buttons}
        class="col-start-4 row-start-1 ms-title-count flex items-center justify-self-end medium:gap-sm heading-two-rows:order-2 heading-two-rows:ms-auto heading-stacked:order-6 heading-stacked:col-span-full heading-stacked:col-start-1 heading-stacked:row-start-auto heading-stacked:mbs-sm heading-stacked:basis-full heading-stacked:justify-end in-toolbar:ms-auto"
      >
        {@render actions()}
      </div>
    {/if}
  </header>
</div>
