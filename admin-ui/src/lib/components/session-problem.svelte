<script lang="ts">
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Loader from "@lucide/svelte/icons/loader";

  import type { ApiError } from "#lib/api.ts";
  import PageHead from "#lib/components/page-head.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { copy } from "#lib/copy.ts";
  import { describeError } from "#lib/error-copy.ts";
  import { documentTitle } from "#lib/page-title.ts";

  let { error, onRetry }: { error: ApiError; onRetry: () => void } = $props();

  const headline = $derived(
    error.kind === "signedOut"
      ? copy.shell.signingIn
      : copy.shell.sessionFailed,
  );
</script>

<svelte:head>
  <title>{documentTitle(headline)}</title>
</svelte:head>

<main class="mx-auto p-4 inline-full max-inline-page tablet:p-6">
  <PageHead title={headline} />
  {#if error.kind === "signedOut"}
    <Alert icon={Loader} role="status">
      <AlertDescription>{copy.shell.signingInHint}</AlertDescription>
    </Alert>
  {:else}
    <Alert icon={CircleAlert}>
      <AlertDescription>{describeError(error)}</AlertDescription>
      <div class="mbs-2">
        <Button variant="outline" onclick={onRetry}>
          {copy.shell.retry}
        </Button>
      </div>
    </Alert>
  {/if}
</main>
