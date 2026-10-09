<script lang="ts">
  import type { Snippet } from "svelte";

  import PageHeading from "#lib/page/PageHeading.svelte";

  import ScreenshotModeLabel from "./ScreenshotModeLabel.svelte";

  interface Props {
    readonly title: string;
    readonly showsLabel: boolean;
    readonly count?: Snippet | undefined;
    readonly actions?: Snippet;
  }

  let { title, showsLabel, count, actions }: Props = $props();

  let header: HTMLElement | undefined = $state();
  let buttons: HTMLElement | undefined = $state();
  let isCrowded = $state(false);
  let roomNeeded = Number.POSITIVE_INFINITY;
  let fittedButtons = 0;

  /** Moves the count under the title while the row overflows, and back beside it once the heading is as wide as it was when moving it, starting over whenever the buttons change. */
  function refit(heading: HTMLElement): void {
    const buttonCount = buttons?.childElementCount ?? 0;
    if (buttonCount !== fittedButtons) {
      fittedButtons = buttonCount;
      roomNeeded = Number.POSITIVE_INFINITY;
      isCrowded = false;
    }
    if (getComputedStyle(heading).display !== "grid") {
      isCrowded = false;
      return;
    }
    if (!isCrowded && heading.scrollWidth > heading.clientWidth) {
      roomNeeded = heading.scrollWidth;
      isCrowded = true;
    } else if (isCrowded && heading.clientWidth >= roomNeeded) {
      isCrowded = false;
    }
  }

  $effect(() => {
    if (header === undefined) {
      return;
    }
    const heading = header;
    let pendingFit: number | undefined;
    const observer = new ResizeObserver(() => {
      pendingFit ??= requestAnimationFrame(() => {
        pendingFit = undefined;
        refit(heading);
      });
    });
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

<div class="@container text-body">
  <header
    bind:this={header}
    data-crowded={isCrowded || undefined}
    class="grid grid-cols-collection-heading items-center heading-two-rows:flex heading-two-rows:flex-wrap heading-two-rows:gap-x-title-count heading-two-rows:gap-y-2xs"
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
        class="col-start-4 row-start-1 ms-title-count flex items-center justify-self-end medium:gap-sm heading-two-rows:order-2 heading-two-rows:ms-auto heading-stacked:order-6 heading-stacked:mbs-sm heading-stacked:basis-full heading-stacked:justify-end"
      >
        {@render actions()}
      </div>
    {/if}
  </header>
</div>
