<script lang="ts">
  import { tick } from "svelte";

  import { page } from "$app/state";

  import ReportView from "#lib/components/report-view.svelte";
  import { focusPageHeadingInDocument } from "#lib/browser-focus.ts";
  import { api } from "#lib/browser-api.ts";
  import { documentTitle } from "#lib/page-title.ts";
  import { refreshAndFocus } from "#lib/refresh-and-focus.ts";
  import { ReportScreen } from "#lib/report-screen.svelte.ts";
  import { useReports } from "#lib/reports-store.svelte.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const reports = useReports();
  const code = $derived(page.params.code ?? "");
  const screen = $derived(
    new ReportScreen({
      api,
      reports,
      code,
      csrf: data.csrf,
      focusHeading: focusPageHeadingInDocument,
      settle: tick,
    }),
  );

  $effect(() => {
    void screen.load();
  });
</script>

<svelte:head>
  <title>{documentTitle(code)}</title>
</svelte:head>

<ReportView
  {code}
  load={screen.report.state}
  move={screen.move}
  onRetry={() => {
    void refreshAndFocus(() => screen.load(), focusPageHeadingInDocument);
  }}
/>
