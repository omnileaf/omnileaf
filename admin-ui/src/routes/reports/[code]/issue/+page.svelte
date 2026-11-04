<script lang="ts">
  import { page } from "$app/state";

  import IssueView from "#lib/components/issue-view.svelte";
  import { focusPageHeadingInDocument } from "#lib/browser-focus.ts";
  import { api } from "#lib/browser-api.ts";
  import { copy } from "#lib/copy.ts";
  import { IssueStore } from "#lib/issue-store.svelte.ts";
  import { documentTitle } from "#lib/page-title.ts";
  import { refreshAndFocus } from "#lib/refresh-and-focus.ts";
  import { fillTemplate } from "#lib/template.ts";

  const code = $derived(page.params.code ?? "");
  const issue = $derived(new IssueStore(api, code));

  $effect(() => {
    void issue.reload();
  });
</script>

<svelte:head>
  <title>{documentTitle(fillTemplate(copy.issue.title, { code }))}</title>
</svelte:head>

<IssueView
  {code}
  load={issue.state}
  onRetry={() => {
    void refreshAndFocus(() => issue.reload(), focusPageHeadingInDocument);
  }}
/>
