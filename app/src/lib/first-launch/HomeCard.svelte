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
  import { currentPlatform } from "#lib/page/platform.ts";

  import { usesSetupPages } from "./setup-pages.ts";

  let {
    title,
    location,
    facts,
    counting,
    change,
  }: {
    title: string;
    location: string;
    facts: readonly HomeFact[];
    counting?: Snippet;
    change?: Snippet<[titleId: string, pathId: string]>;
  } = $props();

  const cardId = $props.id();
  const titleId = `${cardId}-title`;
  const pathId = `${cardId}-path`;
  const isSetupPage = usesSetupPages(currentPlatform());
  const isAndroid = currentPlatform() === "android";
</script>

{#if isSetupPage}
  <section aria-labelledby={titleId} class="flex flex-col gap-xs">
    <div
      class="flex items-center gap-md rounded-windows-control border border-windows-stroke bg-native-card p-lg"
    >
      <Folder size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
      <div class="flex flex-1 flex-col min-inline-none">
        <h2 id={titleId} class="text-label">{title}</h2>
        <span
          id={pathId}
          class="text-caption wrap-anywhere whitespace-pre-wrap text-muted"
          >{location}</span
        >
      </div>
      {@render change?.(titleId, pathId)}
    </div>
    <dl
      class="flex flex-col divide-y divide-native-row-rule rounded-windows-layer border border-windows-stroke bg-native-card"
    >
      {#each facts as fact (fact.term)}
        <div class="grid grid-cols-setup-facts gap-lg px-lg py-md">
          <dt class="text-label text-muted">{fact.term}</dt>
          <dd class="text-label wrap-break-word">{fact.detail}</dd>
        </div>
      {/each}
    </dl>
  </section>
{:else}
  <section
    aria-labelledby={titleId}
    class="flex flex-col overflow-hidden rounded-card border border-border bg-card ios:bg-ios-cell"
  >
    <div class="relative flex items-center gap-md p-md ps-home-card">
      <span
        class="flex shrink-0 items-center justify-center rounded-control bg-chip block-icon-tile inline-icon-tile android:bg-transparent"
      >
        <Folder size={ICON_SIZE} aria-hidden="true" />
      </span>
      {#if isAndroid}
        <div class="flex flex-1 flex-col gap-2xs min-inline-none">
          <h2 id={titleId} class="text-body font-regular">{title}</h2>
          <code
            id={pathId}
            class="font-mono text-native-row-subtitle/native-row-subtitle wrap-anywhere whitespace-pre-wrap text-muted"
            >{location}</code
          >
          {@render counting?.()}
        </div>
      {:else}
        <h2 id={titleId} class="flex-1 text-body font-semibold min-inline-none">
          {title}
        </h2>
      {/if}
      {@render change?.(titleId, pathId)}
    </div>
    {#if !isAndroid}
      <code
        id={pathId}
        class="mx-home-card mbe-home-card rounded-control border border-border bg-chip px-md py-home-path font-mono text-footnote wrap-anywhere whitespace-pre-wrap"
        >{location}</code
      >
    {/if}
    <dl
      class="grid grid-cols-details divide-y divide-border border-bs border-border android:max-medium:flex android:max-medium:flex-col"
    >
      {#each facts as fact (fact.term)}
        <div
          class="col-span-2 grid grid-cols-subgrid gap-x-lg px-home-card py-home-path android:max-medium:flex android:max-medium:flex-col android:max-medium:py-sm"
        >
          <dt
            class="text-footnote text-muted min-inline-home-term android:max-medium:text-body android:max-medium:text-foreground"
          >
            {fact.term}
          </dt>
          <dd
            class="text-small android:max-medium:text-native-row-subtitle/native-row-subtitle android:max-medium:text-muted"
          >
            {fact.detail}
          </dd>
        </div>
      {/each}
    </dl>
  </section>
{/if}
