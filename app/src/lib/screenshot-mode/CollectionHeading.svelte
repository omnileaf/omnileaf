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
</script>

<div class="@container text-body">
  <header
    class="grid grid-cols-collection-heading items-center heading-two-rows:flex heading-two-rows:flex-wrap heading-two-rows:gap-x-title-count heading-two-rows:gap-y-2xs"
  >
    <div
      class="col-start-1 row-start-1 flex flex-wrap items-baseline gap-x-title-count heading-two-rows:contents"
    >
      <div class="heading-two-rows:order-1 heading-stacked:basis-full">
        <PageHeading {title} />
      </div>
      {#if count !== undefined}
        <div class="heading-two-rows:order-4 heading-two-rows:touch:ps-xs">
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
          "flex justify-self-start text-nowrap heading-one-row:col-span-full heading-one-row:row-start-2 heading-one-row:mbs-md heading-one-row:touch:max-medium:ps-xs heading-two-rows:order-5 heading-label-inline:col-start-2 heading-label-inline:row-start-1 heading-label-inline:ms-title-count heading-label-inline:ps-xs heading-label-below:col-span-full heading-label-below:row-start-2 heading-label-below:mbs-md",
          count === undefined && "heading-two-rows:touch:ps-xs",
        ]}
      >
        <ScreenshotModeLabel />
      </div>
    {/if}
    {#if actions !== undefined}
      <div
        class="col-start-4 row-start-1 ms-title-count flex items-center justify-self-end medium:gap-sm heading-two-rows:order-2 heading-two-rows:ms-auto heading-stacked:order-6 heading-stacked:mbs-sm heading-stacked:basis-full heading-stacked:justify-end"
      >
        {@render actions()}
      </div>
    {/if}
  </header>
</div>
