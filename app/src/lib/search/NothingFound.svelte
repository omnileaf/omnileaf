<script lang="ts">
  import { ZoomOut } from "@lucide/svelte";

  import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { nothingFoundTitle } from "./nothing-found";

  const ART_ICON_SIZE = 28;

  let { text }: { text: string } = $props();

  const titleId = $props.id();
</script>

<Empty
  aria-labelledby={titleId}
  class="flex-1 justify-center px-2xl pbe-nothing-found-lift"
>
  <EmptyMedia>
    <ZoomOut size={ART_ICON_SIZE} aria-hidden="true" />
  </EmptyMedia>
  <EmptyTitle id={titleId} class="large:text-heading">
    {nothingFoundTitle(text)}
  </EmptyTitle>
  {#if text !== ""}
    <EmptyDescription class="text-lead max-inline-nothing-found">
      {m.search_nothing_hint()}
    </EmptyDescription>
  {/if}
</Empty>
