<script lang="ts">
  import { page } from "$app/state";

  import { reloadPage } from "#lib/browser-api.ts";
  import ErrorPage from "#lib/components/error-page.svelte";
</script>

<ErrorPage status={page.status} onRetry={reloadPage} />
