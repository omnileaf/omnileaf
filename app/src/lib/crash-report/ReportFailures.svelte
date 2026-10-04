<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import type { CrashReporting, SendFailure } from "./crash-reporting.svelte";

  let { reporting }: { reporting: CrashReporting } = $props();

  const SEND_FAILURES = {
    browserUnavailable: m.crash_report_browser_unavailable,
    notSent: m.crash_report_not_sent,
  } satisfies Record<SendFailure, () => string>;

  const failure = $derived(
    reporting.prompt.kind === "asking" ? reporting.prompt.failure : undefined,
  );
</script>

<div role="alert" class="text-footnote">
  {#if reporting.copying.outcome === "failed"}
    <p>{m.crash_report_copy_failed()}</p>
  {/if}
  {#if failure !== undefined}
    <p>{SEND_FAILURES[failure]()}</p>
  {/if}
</div>
