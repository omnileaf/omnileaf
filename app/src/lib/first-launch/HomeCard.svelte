<script lang="ts" module>
  export interface HomeFact {
    readonly term: string;
    readonly detail: string;
  }
</script>

<script lang="ts">
  import { Folder } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { ICON_SIZE } from "#lib/library/icon-size.ts";

  let {
    title,
    location,
    facts,
    change,
  }: {
    title: string;
    location: string;
    facts: readonly HomeFact[];
    change?: Snippet<[titleId: string, pathId: string]>;
  } = $props();

  const cardId = $props.id();
  const titleId = `${cardId}-title`;
  const pathId = `${cardId}-path`;
</script>

<section
  aria-labelledby={titleId}
  class="flex flex-col overflow-hidden rounded-card border border-border bg-card ios:bg-ios-cell"
>
  <div class="relative flex items-center gap-md p-md ps-home-card">
    <span
      class="flex shrink-0 items-center justify-center rounded-control bg-chip block-icon-tile inline-icon-tile"
    >
      <Folder size={ICON_SIZE} aria-hidden="true" />
    </span>
    <h2 id={titleId} class="flex-1 text-body font-semibold min-inline-none">
      {title}
    </h2>
    {@render change?.(titleId, pathId)}
  </div>
  <code
    id={pathId}
    class="mx-home-card mbe-home-card rounded-control border border-border bg-chip px-md py-home-path font-mono text-footnote wrap-anywhere whitespace-pre-wrap"
    >{location}</code
  >
  <dl
    class="grid grid-cols-details divide-y divide-border border-bs border-border"
  >
    {#each facts as fact (fact.term)}
      <div
        class="col-span-2 grid grid-cols-subgrid gap-x-lg px-home-card py-home-path"
      >
        <dt class="text-footnote text-muted min-inline-home-term">
          {fact.term}
        </dt>
        <dd class="text-small wrap-break-word">{fact.detail}</dd>
      </div>
    {/each}
  </dl>
</section>
