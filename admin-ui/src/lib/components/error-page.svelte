<script lang="ts">
  import { resolve } from "$app/paths";

  import { cn } from "#lib/cn.ts";
  import PageHead from "#lib/components/page-head.svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { buttonLook } from "#lib/components/ui/button/variants.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import { copy } from "#lib/copy.ts";
  import { documentTitle } from "#lib/page-title.ts";

  const NOT_FOUND = 404;

  let { status, onRetry }: { status: number; onRetry: () => void } = $props();

  const notFound = $derived(status === NOT_FOUND);
  const headline = $derived(
    notFound ? copy.errorPage.notFound : copy.errorPage.failed,
  );
  const hint = $derived(
    notFound ? copy.errorPage.notFoundHint : copy.errorPage.failedHint,
  );
</script>

<svelte:head>
  <title>{documentTitle(headline)}</title>
</svelte:head>

<PageHead title={headline} subtitle={hint} />

<div class="flex flex-wrap gap-3">
  {#if !notFound}
    <Button variant="outline" onclick={onRetry}>{copy.shell.retry}</Button>
  {/if}
  <a
    href={resolve("/")}
    class={cn(buttonLook("default", "default"), FOCUS_RING)}
  >
    {copy.errorPage.backToDashboard}
  </a>
</div>
