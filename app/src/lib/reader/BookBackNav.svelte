<script lang="ts">
  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import type { BookPlace, Platform } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { readerBackLook } from "./reader-bar.ts";
  import ReaderBackArrow from "./ReaderBackArrow.svelte";

  const SERIES_NAME = "truncate text-small text-muted expanded:hidden";
  const ANDROID_BAR_TITLE =
    "truncate text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title text-foreground";

  let { place, platform }: { place: BookPlace | null; platform: Platform } =
    $props();

  const width = new WindowWidth();
  const isOnPhone = $derived(isPhone(platform, width.current));
  const namesSeries = $derived(!(isOnPhone && platform === "ios"));
  const seriesName = $derived(
    isOnPhone && platform === "android" ? ANDROID_BAR_TITLE : SERIES_NAME,
  );
  const libraryHref = resolve("/(app)");
  const inLibraryPlace = $derived(
    place !== null && place.isInLibrary ? place : null,
  );
  const seriesHref = $derived(
    inLibraryPlace === null
      ? undefined
      : resolve("/(app)/series/[id]", { id: inLibraryPlace.series }),
  );
</script>

<nav
  aria-label={m.reader_breadcrumb()}
  class="flex items-center gap-xs self-start px-reader-bar-inline pbs-reader-bar-top min-inline-none expanded:px-lg expanded:pbs-md"
>
  <a
    href={seriesHref ?? libraryHref}
    aria-label={inLibraryPlace === null
      ? m.reader_back_label()
      : m.reader_back_to_series({ series: inLibraryPlace.seriesTitle })}
    class={cn(
      readerBackLook(platform, width.current),
      isOnPhone && platform === "android" && "text-foreground",
    )}
  >
    <ReaderBackArrow {platform} {isOnPhone} />
  </a>
  {#if inLibraryPlace !== null && seriesHref !== undefined && namesSeries}
    <a href={seriesHref} aria-hidden="true" tabindex="-1" class={seriesName}
      >{inLibraryPlace.seriesTitle}</a
    >
    <Breadcrumb class="hidden text-small expanded:block">
      <BreadcrumbItem class="min-inline-none">
        <a
          href={seriesHref}
          class="block truncate text-muted transition-control max-inline-reader-crumb-series hover:text-foreground"
          >{inLibraryPlace.seriesTitle}</a
        >
      </BreadcrumbItem>
      <BreadcrumbSeparator class="text-muted" />
      <BreadcrumbItem class="min-inline-none">
        <BreadcrumbPage class="block truncate max-inline-reader-crumb-book">
          {inLibraryPlace.title}
        </BreadcrumbPage>
      </BreadcrumbItem>
    </Breadcrumb>
  {/if}
</nav>
