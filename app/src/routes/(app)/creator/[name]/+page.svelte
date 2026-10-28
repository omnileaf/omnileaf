<script lang="ts">
  import {
    ChevronLeft,
    CircleAlert,
    FolderSearch,
    Library,
    RefreshCw,
  } from "@lucide/svelte";
  import { tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { buttonClasses } from "#lib/components/ui/button/looks.ts";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverTileLook } from "#lib/library/cover-tile.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import {
    type ActionGroupLook,
    actionGroupLook,
  } from "#lib/page/action-group.ts";
  import { EXPANDED_QUERY, WindowWidth } from "#lib/page/breakpoints.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import PageHeading from "#lib/page/PageHeading.svelte";
  import PageToolbar from "#lib/page/PageToolbar.svelte";
  import { isPhone } from "#lib/page/platform.ts";
  import { backIcon } from "#lib/page/top-bar.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { TODAYS_PROBLEM_ACTIONS } from "#lib/reader/problem-actions.ts";
  import ProblemHeading from "#lib/reader/ProblemHeading.svelte";
  import { PROBLEM_TEXT, problemLayout } from "#lib/reader/problem-heading.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { CREATOR_SERIES } from "#lib/series/creator-series.ts";
  import { roleName } from "#lib/series/creator-role.ts";
  import { SERIES_CHIP } from "#lib/series/series-chip.ts";
  import { SERIES_CONTROL } from "#lib/series/series-control.ts";

  import type { PageProps } from "./$types";

  const DESKTOPS: readonly Platform[] = ["linux", "macos", "windows"];
  const BACK_ICON_SIZE = 20;
  const ICON_SIZE = 16;
  const TODAYS_ACTIONS: ActionGroupLook = {
    group: "flex flex-wrap justify-center gap-sm",
    main: "",
    other: SERIES_CONTROL,
  };

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const width = new WindowWidth();
  const platform = $derived(data.appInfo.platform);
  const isOnPhone = $derived(isPhone(platform, width.current));
  const tile = $derived(coverTileLook(platform));
  const actions = $derived(
    actionGroupLook(platform, width.current, TODAYS_ACTIONS),
  );
  const problemActions = $derived(
    actionGroupLook(platform, width.current, TODAYS_PROBLEM_ACTIONS),
  );
  const hasToolbar = $derived(DESKTOPS.includes(platform) && isWide.current);
  const look = $derived(screenshotMode.isOn ? standInLook : realLook);
  const layout = $derived(problemLayout(platform, width.current));
  let isReadingAgain = $state(false);
  let attempts = $state(0);
  let nameHeading: HTMLElement | null = $state(null);
  let tryAgainButton: HTMLButtonElement | null = $state(null);

  async function readAgain(): Promise<void> {
    if (isReadingAgain) {
      return;
    }
    isReadingAgain = true;
    try {
      await invalidate(CREATOR_SERIES);
    } catch (error) {
      reportError(error);
    } finally {
      isReadingAgain = false;
    }
    attempts += 1;
    await tick();
    (data.series.kind === "failed"
      ? tryAgainButton
      : nameHeading?.querySelector("h1")
    )?.focus();
  }

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
      <BreadcrumbItem class="shrink-0">
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
    {#if isOnPhone}
      <a
        href={back.href}
        data-back-link
        aria-label={back.label}
        class={buttonClasses("header-control", platform, {
          width: width.current,
        })}
      >
        <Icon name={backIcon(platform)} />
      </a>
    {:else}
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
        <ChevronLeft
          size={BACK_ICON_SIZE}
          aria-hidden="true"
          class="shrink-0"
        />
        <span class="hidden truncate text-body ios:inline">{back.short}</span>
      </a>
    {/if}
  </header>
{/if}
{#if data.series.kind === "read"}
  {@const found = data.series.series}
  <div
    class={[
      "flex flex-1 flex-col gap-lg expanded:gap-xl",
      hasToolbar && "pbs-xl",
    ]}
  >
    <div bind:this={nameHeading} class="flex flex-col gap-2xs">
      {#if isOnPhone}
        <PageHeading title={data.name} size="large" />
      {:else}
        <h1
          tabindex="-1"
          class="text-page-title font-bold tracking-tight wrap-break-word expanded:text-series-title"
        >
          {data.name}
        </h1>
      {/if}
      {#if found.length > 0}
        <p class="text-small text-muted">
          {m.creator_series_count({ count: found.length })}
        </p>
      {/if}
    </div>
    {#if found.length > 0}
      <ul
        aria-label={m.creator_series_list({ name: data.name })}
        class="grid grid-cols-3 gap-x-md gap-y-cover-row expanded:grid-cols-6 expanded:gap-x-xl expanded:gap-y-cover-row-wide"
      >
        {#each found as series (series.id)}
          {@const shown = look(series)}
          <li class="min-inline-none">
            <a
              href={resolve("/(app)/series/[id]", { id: series.id })}
              class="flex flex-col gap-icon-gap expanded:gap-sm"
            >
              <span
                class={cn(
                  "relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
                  tile.cover,
                )}
              >
                <CoverImage cover={shown.cover} {coverUrl} />
              </span>
              <span class="flex flex-col min-inline-none">
                <span
                  class="line-clamp-2 text-small font-medium wrap-break-word"
                >
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
        <div class={cn(actions.group, "mbs-lg")}>
          <a href={resolve("/(app)")} class={actions.other}>
            <Library size={ICON_SIZE} aria-hidden="true" />
            {m.series_back_label()}
          </a>
        </div>
      </EmptyState>
    {/if}
  </div>
{:else}
  <div
    class={[
      "flex flex-1 items-center justify-center pbe-empty-lift",
      hasToolbar && "pbs-xl",
    ]}
  >
    {#key attempts}
      <section
        role="alert"
        class="flex flex-col gap-lg inline-full max-inline-damaged-book"
      >
        <ProblemHeading icon={CircleAlert} {platform}>
          {m.creator_failed({ name: data.name })}
        </ProblemHeading>
        <p class={["text-body expanded:text-small", PROBLEM_TEXT[layout]]}>
          {m.library_unchanged()}
        </p>
        <div class={problemActions.group}>
          <button
            bind:this={tryAgainButton}
            type="button"
            class={problemActions.main}
            aria-disabled={isReadingAgain}
            aria-busy={isReadingAgain}
            onclick={() => void readAgain()}
          >
            <RefreshCw size={ICON_SIZE} aria-hidden="true" />
            {m.library_try_again()}
          </button>
          <a href={resolve("/(app)")} class={problemActions.other}>
            <Library size={ICON_SIZE} aria-hidden="true" />
            {m.series_back_label()}
          </a>
        </div>
      </section>
    {/key}
  </div>
{/if}
