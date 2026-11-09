<script lang="ts">
  import { untrack } from "svelte";

  import {
    provideReports,
    type ReportsStore,
  } from "#lib/reports-store.svelte.ts";

  import ReportPage from "../routes/reports/[code]/+page.svelte";

  let { store, code }: { store: ReportsStore; code: string } = $props();

  provideReports(untrack(() => store));
</script>

<ReportPage
  data={{
    session: { ok: true, value: { login: "alice", csrf: "token" } },
    csrf: "token",
  }}
  params={{ code }}
/>
