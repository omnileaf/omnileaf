<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { ANDROID_SKELETON } from "./series-skeleton-look.ts";
  import {
    ABOUT_COLUMN,
    ABOUT_COVER,
    ABOUT_HEAD,
    ABOUT_LINES,
  } from "./series-about-layout.ts";

  const ROWS = 3;
  const MACOS_ROWS = 8;

  const isMacos = currentPlatform() === "macos";
  const isWindows = currentPlatform() === "windows";
  const width = new WindowWidth();
  const isAndroidPhone = $derived(
    phoneOf(currentPlatform(), width.current) === "android",
  );
</script>

{#if isWindows}
  <Progress
    value={null}
    aria-label={m.series_loading()}
    class="mbe-md inline-full"
  />
{/if}
<div
  role="status"
  aria-label={m.series_loading()}
  class="flex flex-col gap-xl max-expanded:mbs-sm @series-split:flex-row @series-split:items-start @series-split:gap-2xl"
>
  {#if isMacos}
    <div class={ABOUT_COLUMN}>
      <div class={ABOUT_HEAD}>
        <Skeleton class={cn(ABOUT_COVER, "rounded-skeleton-macos")} />
        <div class={ABOUT_LINES}>
          <Skeleton
            class="rounded-skeleton-macos block-xl inline-skeleton-title-macos"
          />
          <Skeleton
            class="rounded-skeleton-macos block-skeleton-line-macos inline-skeleton-line"
          />
        </div>
      </div>
      <Skeleton
        class="rounded-skeleton-macos block-native-button inline-full"
      />
    </div>
    <div class="flex flex-1 flex-col gap-native-series-gap min-inline-none">
      <Skeleton class="rounded-native-card block-skeleton-card-macos" />
      <Skeleton class="rounded-skeleton-macos block-xl inline-3/5" />
      <div class="flex flex-col">
        {#each { length: MACOS_ROWS }, row (row)}
          <div class="flex items-center gap-lg px-sm block-skeleton-row-macos">
            <Skeleton
              class="shrink-0 rounded-skeleton-macos block-skeleton-check-macos inline-skeleton-check-macos"
            />
            <Skeleton class="rounded-skeleton-macos block-md inline-19/50" />
            <Skeleton
              class="ms-auto shrink-0 rounded-skeleton-macos block-md inline-skeleton-trailing-macos"
            />
          </div>
        {/each}
      </div>
    </div>
  {:else if isAndroidPhone}
    <div class={ANDROID_SKELETON.page}>
      <div class={ANDROID_SKELETON.head}>
        <Skeleton class={ANDROID_SKELETON.cover} />
        <div class={ANDROID_SKELETON.lines}>
          {#each ANDROID_SKELETON.headLines as line (line)}
            <Skeleton class={line} />
          {/each}
        </div>
      </div>
      <Skeleton class={ANDROID_SKELETON.actions} />
      <Skeleton class={ANDROID_SKELETON.note} />
      <Skeleton class={ANDROID_SKELETON.card} />
      <div class={ANDROID_SKELETON.books}>
        {#each ANDROID_SKELETON.bookLines as line, row (row)}
          <Skeleton class={line} />
        {/each}
      </div>
    </div>
  {:else}
    <div
      class="flex flex-col items-center gap-md expanded:items-start @series-split:shrink-0 @series-split:inline-series-aside"
    >
      <Skeleton
        class="aspect-cover rounded-series-cover inline-series-cover expanded:inline-series-cover-wide"
      />
      <Skeleton class="block-xl inline-skeleton-title" />
      <Skeleton class="block-lg inline-skeleton-line" />
      <Skeleton
        class="mbs-md block-touch-target inline-full expanded:mbs-none expanded:block-pointer-button"
      />
    </div>
    <div class="flex flex-1 flex-col gap-lg min-inline-none">
      <Skeleton
        class="rounded-card block-skeleton-card expanded:block-skeleton-card-wide"
      />
      <Skeleton class="block-touch-target expanded:block-pointer-button" />
      <div class="flex flex-col gap-lg rounded-card border border-border p-lg">
        {#each { length: ROWS }, row (row)}
          <div class="flex flex-col gap-sm">
            <Skeleton class="block-lg inline-skeleton-title" />
            <Skeleton class="block-md inline-skeleton-line" />
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
