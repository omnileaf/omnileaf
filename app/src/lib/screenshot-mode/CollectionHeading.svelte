<script lang="ts">
  import type { Snippet } from "svelte";

  import PageHeading from "#lib/page/PageHeading.svelte";

  import ScreenshotModeLabel from "./ScreenshotModeLabel.svelte";

  interface Props {
    readonly title: string;
    readonly showsLabel: boolean;
    readonly count?: Snippet;
    readonly actions?: Snippet;
  }

  let { title, showsLabel, count, actions }: Props = $props();
</script>

<header class="flex flex-wrap items-center gap-x-title-count gap-y-md">
  <div class="flex items-baseline gap-title-count">
    <PageHeading {title} />
    {@render count?.()}
  </div>
  {#if showsLabel}
    <div
      class="flex max-expanded:order-last max-expanded:basis-full expanded:ms-xs touch:max-medium:ps-xs"
    >
      <ScreenshotModeLabel />
    </div>
  {/if}
  {#if actions !== undefined}
    <div class="ms-auto flex items-center gap-sm">
      {@render actions()}
    </div>
  {/if}
</header>
