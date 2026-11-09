<script lang="ts">
  import Copy from "@lucide/svelte/icons/copy";

  import { resolve } from "$app/paths";

  import { cn } from "#lib/cn.ts";
  import { buttonLook } from "#lib/components/ui/button/variants.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import ReportAudit from "#lib/components/report-audit.svelte";
  import MoveCard from "#lib/components/move-card.svelte";
  import type { MoveProps } from "#lib/move-props.ts";
  import ReportCrumb from "#lib/components/report-crumb.svelte";
  import ReportError from "#lib/components/report-error.svelte";
  import ReportFacts from "#lib/components/report-facts.svelte";
  import ReportHeader from "#lib/components/report-header.svelte";
  import ReportNotFound from "#lib/components/report-not-found.svelte";
  import ReportSkeleton from "#lib/components/report-skeleton.svelte";
  import ReportText from "#lib/components/report-text.svelte";
  import { copy } from "#lib/copy.ts";
  import { pathSegment } from "#lib/path-segment.ts";
  import type { ReportState } from "#lib/report-store.svelte.ts";

  let {
    code,
    load,
    move,
    onRetry,
  }: {
    code: string;
    load: ReportState;
    move: MoveProps | undefined;
    onRetry: () => void;
  } = $props();
</script>

<ReportCrumb />
{#snippet copyAsIssue()}
  <a
    href={resolve("/reports/[code]/issue", { code: pathSegment(code) })}
    class={cn(buttonLook("outline", "default"), FOCUS_RING)}
  >
    <Copy class="block-4 inline-4" />
    {copy.report.copyAsIssue}
  </a>
{/snippet}

<ReportHeader
  {code}
  status={load.kind === "ready" ? load.detail.listed.status : undefined}
  actions={load.kind === "ready" ? copyAsIssue : undefined}
/>

{#if load.kind === "loading"}
  <ReportSkeleton />
{:else if load.kind === "notFound"}
  <ReportNotFound />
{:else if load.kind === "failed"}
  <ReportError
    title={copy.report.loadFailed}
    message={load.message}
    {onRetry}
  />
{:else}
  <ReportFacts report={load.detail.listed} />
  <div
    class="mbs-4 grid items-start gap-4 tablet:mbs-6 tablet:grid-cols-3 tablet:gap-6"
  >
    {#if move !== undefined}
      <div class="tablet:order-last">
        <MoveCard {code} status={load.detail.listed.status} {move} />
      </div>
    {/if}
    <div class="grid gap-4 tablet:col-span-2 tablet:gap-6">
      <ReportText text={load.detail.report} />
      <ReportAudit entries={load.detail.audit} />
    </div>
  </div>
{/if}
