<script lang="ts">
  import PageHeading from "$lib/page/PageHeading.svelte";

  import ScreenshotModeLabel from "./ScreenshotModeLabel.svelte";

  interface Props {
    readonly title: string;
    readonly showsLabel: boolean;
  }

  let { title, showsLabel }: Props = $props();
</script>

<header
  class="flex flex-col items-start gap-sm expanded:flex-row expanded:items-center expanded:gap-md"
>
  <PageHeading {title} />
  {#if showsLabel}
    <ScreenshotModeLabel />
  {/if}
</header>
