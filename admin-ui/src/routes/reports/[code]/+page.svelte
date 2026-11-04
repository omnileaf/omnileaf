<script lang="ts">
  import { page } from "$app/state";

  import PageHead from "#lib/components/page-head.svelte";
  import { documentTitle } from "#lib/page-title.ts";

  const code = $derived(page.params.code ?? "");
</script>

<svelte:head>
  <title>{documentTitle(code)}</title>
</svelte:head>

<PageHead title={code} />
