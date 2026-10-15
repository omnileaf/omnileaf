<script lang="ts">
  import { ChevronLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import type { BookPlace } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { READER_BUTTON, READER_ICON_SIZE } from "./reader-bar.ts";

  let { place }: { place: BookPlace | null } = $props();

  const libraryHref = resolve("/(app)");
  const seriesHref = $derived(
    place === null
      ? undefined
      : resolve("/(app)/series/[id]", { id: place.series }),
  );
</script>

<nav
  aria-label={m.reader_breadcrumb()}
  class="flex items-center gap-xs self-start px-reader-bar-inline pbs-reader-bar-top min-inline-none expanded:px-lg expanded:pbs-md"
>
  <a
    href={seriesHref ?? libraryHref}
    aria-label={place === null
      ? m.reader_back_label()
      : m.reader_back_to_series({ series: place.seriesTitle })}
    class={READER_BUTTON}
  >
    <ChevronLeft size={READER_ICON_SIZE} aria-hidden="true" />
  </a>
  {#if place !== null && seriesHref !== undefined}
    <a
      href={seriesHref}
      aria-hidden="true"
      tabindex="-1"
      class="truncate text-small text-muted expanded:hidden"
      >{place.seriesTitle}</a
    >
    <Breadcrumb class="hidden text-small expanded:block">
      <BreadcrumbItem class="min-inline-none">
        <a
          href={seriesHref}
          class="block truncate text-muted transition-control max-inline-reader-crumb-series hover:text-foreground"
          >{place.seriesTitle}</a
        >
      </BreadcrumbItem>
      <BreadcrumbSeparator class="text-muted" />
      <BreadcrumbItem class="min-inline-none">
        <BreadcrumbPage class="block truncate max-inline-reader-crumb-book">
          {place.title}
        </BreadcrumbPage>
      </BreadcrumbItem>
    </Breadcrumb>
  {/if}
</nav>
