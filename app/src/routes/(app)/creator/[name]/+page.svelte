<script lang="ts">
  import { ChevronLeft, FolderSearch, Library } from "@lucide/svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import PageToolbar from "#lib/page/PageToolbar.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { roleName } from "#lib/series/creator-role.ts";
  import { SERIES_CHIP } from "#lib/series/series-chip.ts";
  import { SERIES_CONTROL } from "#lib/series/series-control.ts";

  import type { PageProps } from "./$types";

  const DESKTOPS: readonly Platform[] = ["linux", "macos", "windows"];
  const BACK_ICON_SIZE = 20;
  const ICON_SIZE = 16;

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const hasToolbar = $derived(
    DESKTOPS.includes(data.appInfo.platform) && isWide.current,
  );
  const look = $derived(screenshotMode.isOn ? standInLook : realLook);
  const back = $derived(
    data.from === undefined
      ? {
          href: resolve("/(app)"),
          label: m.series_back_label(),
          short: m.series_back(),
        }
      : {
          href: resolve("/(app)/series/[id]", { id: data.from.id }),
          label: m.creator_back_to({ title: data.from.title }),
          short: data.from.title,
        },
  );
</script>

{#if hasToolbar}
  <PageToolbar>
    <Breadcrumb
      aria-label={m.series_breadcrumb()}
      class="flex items-center text-small text-muted min-inline-none"
    >
      <BreadcrumbItem>
        <a
          href={resolve("/(app)")}
          data-back-link={data.from === undefined || undefined}
          class="transition-control hover:text-foreground"
        >
          {m.series_back()}
        </a>
      </BreadcrumbItem>
      {#if data.from !== undefined}
        <BreadcrumbSeparator />
        <BreadcrumbItem class="min-inline-none">
          <a
            href={back.href}
            data-back-link
            class="block truncate transition-control max-inline-creator-crumb hover:text-foreground"
          >
            {screenshotMode.isOn ? m.series_back() : data.from.title}
          </a>
        </BreadcrumbItem>
      {/if}
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <BreadcrumbPage class="text-foreground">{data.name}</BreadcrumbPage>
      </BreadcrumbItem>
    </Breadcrumb>
  </PageToolbar>
{:else}
  <header class="-ms-page-start -mbs-title-gap ps-series-bar-start pbe-xs">
    <a
      href={back.href}
      data-back-link
      aria-label={back.label}
      class={cn(
        "flex items-center justify-center gap-2xs rounded-full",
        SERIES_CHIP,
        "ios:ps-sm ios:pe-md ios:inline-auto ios:max-inline-creator-crumb",
      )}
    >
      <ChevronLeft size={BACK_ICON_SIZE} aria-hidden="true" class="shrink-0" />
      <span class="hidden truncate text-body ios:inline">{back.short}</span>
    </a>
  </header>
{/if}
<div
  class={[
    "flex flex-1 flex-col gap-lg expanded:gap-xl",
    hasToolbar && "pbs-xl",
  ]}
>
  <div class="flex flex-col gap-2xs">
    <h1
      tabindex="-1"
      class="text-page-title font-bold tracking-tight wrap-break-word expanded:text-series-title"
    >
      {data.name}
    </h1>
    {#if data.series.length > 0}
      <p class="text-small text-muted">
        {m.creator_series_count({ count: data.series.length })}
      </p>
    {/if}
  </div>
  {#if data.series.length > 0}
    <ul
      aria-label={m.creator_series_list({ name: data.name })}
      class="grid grid-cols-3 gap-x-md gap-y-cover-row expanded:grid-cols-6 expanded:gap-x-xl expanded:gap-y-cover-row-wide"
    >
      {#each data.series as series (series.id)}
        {@const shown = look(series)}
        <li class="min-inline-none">
          <a
            href={resolve("/(app)/series/[id]", { id: series.id })}
            class="flex flex-col gap-icon-gap expanded:gap-sm"
          >
            <span
              class="relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
            >
              <CoverImage cover={shown.cover} {coverUrl} />
            </span>
            <span class="flex flex-col min-inline-none">
              <span class="line-clamp-2 text-small font-medium wrap-break-word">
                {shown.title}
              </span>
              {#if series.role !== null}
                <span class="text-caption text-muted">
                  {roleName(series.role)}
                </span>
              {/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <EmptyState
      icon={FolderSearch}
      title={m.creator_empty({ name: data.name })}
      body={m.creator_empty_body()}
    >
      <a href={resolve("/(app)")} class={cn(SERIES_CONTROL, "mbs-lg")}>
        <Library size={ICON_SIZE} aria-hidden="true" />
        {m.series_back_label()}
      </a>
    </EmptyState>
  {/if}
</div>
