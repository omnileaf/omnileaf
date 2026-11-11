<script lang="ts">
  import {
    animationsSettingForDocument,
    setAnimationsSetting,
  } from "#lib/appearance/animations.svelte.ts";
  import type { BookPage } from "#lib/ipc/bindings.ts";

  import StripStack from "./StripStack.svelte";

  let { isShown }: { isShown: boolean } = $props();

  const PAGE_COUNT = 6;
  const pages = Array.from({ length: PAGE_COUNT }, (_, index): BookPage => ({
    path: `page/${String(index)}` as BookPage["path"],
    thumbnail: `thumb/${String(index)}` as BookPage["thumbnail"],
    size: { width: 800, height: 2400 },
  }));

  setAnimationsSetting(animationsSettingForDocument());

  function nothing(): void {}
</script>

{#snippet overlay()}{/snippet}

<main class="fixed inset-none">
  {#if isShown}
    <StripStack
      {pages}
      crop="whole"
      shown={0}
      isBlank={true}
      marks={[]}
      {overlay}
      startAt={undefined}
      onShown={nothing}
      onShownReady={nothing}
    />
  {/if}
</main>
