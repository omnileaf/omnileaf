<script lang="ts">
  import IssueCrumb from "#lib/components/issue-crumb.svelte";
  import IssuePurged from "#lib/components/issue-purged.svelte";
  import IssueSkeleton from "#lib/components/issue-skeleton.svelte";
  import IssueText from "#lib/components/issue-text.svelte";
  import PageHead from "#lib/components/page-head.svelte";
  import ReportError from "#lib/components/report-error.svelte";
  import ReportNotFound from "#lib/components/report-not-found.svelte";
  import { copy } from "#lib/copy.ts";
  import type { IssueState } from "#lib/issue-store.svelte.ts";
  import { fillTemplate } from "#lib/template.ts";

  let {
    code,
    load,
    onRetry,
  }: { code: string; load: IssueState; onRetry: () => void } = $props();
</script>

<IssueCrumb {code} />
<PageHead title={fillTemplate(copy.issue.title, { code })} />

{#if load.kind === "loading"}
  <IssueSkeleton />
{:else if load.kind === "notFound"}
  <ReportNotFound />
{:else if load.kind === "failed"}
  <ReportError title={copy.issue.loadFailed} message={load.message} {onRetry} />
{:else if load.kind === "purged"}
  <IssuePurged {code} />
{:else}
  <IssueText {code} body={load.body} />
{/if}
