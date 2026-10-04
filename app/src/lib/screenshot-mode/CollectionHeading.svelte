<script lang="ts">
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
  <h1 tabindex="-1" class="text-headline font-bold">{title}</h1>
  {#if showsLabel}
    <ScreenshotModeLabel />
  {/if}
</header>
