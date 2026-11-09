<script lang="ts">
  import { resolve } from "$app/paths";

  import { barRows } from "#lib/bars.ts";
  import BarList from "#lib/components/bar-list.svelte";
  import DashboardSkeleton from "#lib/components/dashboard-skeleton.svelte";
  import PageHead from "#lib/components/page-head.svelte";
  import ReportRows from "#lib/components/report-rows.svelte";
  import ReportsEmpty from "#lib/components/reports-empty.svelte";
  import ReportsError from "#lib/components/reports-error.svelte";
  import StatusCards from "#lib/components/status-cards.svelte";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import {
    buttonLook,
    OUTLINE_TO_GHOST_FROM_TABLET,
  } from "#lib/components/ui/button/variants.ts";
  import { cn } from "#lib/cn.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import { copy } from "#lib/copy.ts";
  import type { ReportColumn } from "#lib/report-columns.ts";
  import { filterToQuery } from "#lib/reports-query.ts";
  import type { ReportsState } from "#lib/reports-store.svelte.ts";
  import {
    awaitingReview,
    countByPlatform,
    countByStatus,
    countByVersion,
  } from "#lib/reports.ts";

  let { load, onRetry }: { load: ReportsState; onRetry: () => void } = $props();

  const NEEDS_REVIEW_LIMIT = 10;
  const NEEDS_REVIEW_COLUMNS: readonly ReportColumn[] = [
    "platform",
    "version",
    "received",
  ];
</script>

<PageHead
  title={copy.shell.dashboard}
  subtitle={{
    phone: copy.dashboard.phoneSubtitle,
    tablet: copy.dashboard.subtitle,
  }}
/>

{#if load.kind === "loading"}
  <DashboardSkeleton />
{:else if load.kind === "failed"}
  <ReportsError message={load.message} {onRetry} />
{:else if load.reports.length === 0}
  <ReportsEmpty />
{:else}
  {@const waiting = awaitingReview(load.reports).slice(0, NEEDS_REVIEW_LIMIT)}
  <StatusCards counts={countByStatus(load.reports)} />
  <div class="mbs-4 grid gap-4 tablet:mbs-6 tablet:grid-cols-2 tablet:gap-6">
    <Card>
      <CardHeader>
        <CardTitle>{copy.dashboard.byPlatform}</CardTitle>
        <CardDescription>{copy.dashboard.byPlatformHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <BarList rows={barRows(countByPlatform(load.reports))} />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>{copy.dashboard.byVersion}</CardTitle>
        <CardDescription>{copy.dashboard.byVersionHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <BarList rows={barRows(countByVersion(load.reports))} />
      </CardContent>
    </Card>
  </div>
  <Card class="mbs-4 tablet:mbs-6">
    <CardHeader
      class="flex flex-col items-start gap-3 tablet:flex-row tablet:items-center tablet:justify-between"
    >
      <div class="grid gap-1">
        <CardTitle>{copy.dashboard.needsReview}</CardTitle>
        <CardDescription>{copy.dashboard.needsReviewHint}</CardDescription>
      </div>
      <a
        href={resolve(`/reports${filterToQuery({ status: "received" })}`)}
        class={cn(
          buttonLook("outline", "sm"),
          OUTLINE_TO_GHOST_FROM_TABLET,
          FOCUS_RING,
        )}
      >
        {copy.dashboard.viewAll}
      </a>
    </CardHeader>
    {#if waiting.length === 0}
      <p class="px-5 text-small text-muted">{copy.dashboard.nothingToReview}</p>
    {:else}
      <ReportRows reports={waiting} columns={NEEDS_REVIEW_COLUMNS} />
    {/if}
  </Card>
  {#if load.truncated}
    <p class="mbs-4 text-small text-muted">{copy.dashboard.truncated}</p>
  {/if}
{/if}
