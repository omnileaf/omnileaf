<script lang="ts">
  import PageHead from "#lib/components/page-head.svelte";
  import { copy } from "#lib/copy.ts";
  import { documentTitle } from "#lib/page-title.ts";
</script>

<svelte:head>
  <title>{documentTitle(copy.shell.reports)}</title>
</svelte:head>

<PageHead title={copy.shell.reports} />
