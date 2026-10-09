<script lang="ts">
  import { ZoomOut } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  import { nothingFoundTitle } from "./nothing-found";

  const ART_ICON_SIZE = 28;

  let { text }: { text: string } = $props();

  const titleId = $props.id();
</script>

<section
  aria-labelledby={titleId}
  class="flex flex-1 flex-col items-center justify-center gap-md px-2xl pbe-nothing-found-lift text-center"
>
  <span
    class="flex items-center justify-center rounded-full bg-accent-soft block-empty-art inline-empty-art"
  >
    <ZoomOut size={ART_ICON_SIZE} aria-hidden="true" />
  </span>
  <h2 id={titleId} class="mbs-sm text-title font-bold large:text-heading">
    {nothingFoundTitle(text)}
  </h2>
  {#if text !== ""}
    <p class="text-lead text-muted max-inline-nothing-found">
      {m.search_nothing_hint()}
    </p>
  {/if}
</section>
