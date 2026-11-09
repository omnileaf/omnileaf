<script lang="ts">
  import { untrack, type Component } from "svelte";

  import {
    provideReports,
    type ReportsStore,
  } from "#lib/reports-store.svelte.ts";

  let { route: Route, store }: { route: Component; store: ReportsStore } =
    $props();

  provideReports(untrack(() => store));
</script>

<Route />
