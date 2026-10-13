<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import { Alert, AlertTitle } from "#lib/components/ui/alert/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { CrashReporting, SendFailure } from "./crash-reporting.svelte";

  let { reporting }: { reporting: CrashReporting } = $props();

  const SEND_FAILURES = {
    browserUnavailable: m.crash_report_browser_unavailable,
    notSent: m.crash_report_not_sent,
  } satisfies Record<SendFailure, () => string>;

  const failure = $derived(
    reporting.prompt.kind === "asking" ? reporting.prompt.failure : undefined,
  );
  const isCopyFailed = $derived(reporting.copying.outcome === "failed");
  const isQuiet = $derived(!isCopyFailed && failure === undefined);
</script>

<div
  role="alert"
  class={["flex flex-col gap-sm", isQuiet && "-mbs-dialog-gap"]}
>
  {#if isCopyFailed}
    <Alert tone="warning" icon={CircleAlert}>
      <AlertTitle>{m.crash_report_copy_failed()}</AlertTitle>
    </Alert>
  {/if}
  {#if failure !== undefined}
    <Alert tone="warning" icon={CircleAlert}>
      <AlertTitle>{SEND_FAILURES[failure]()}</AlertTitle>
    </Alert>
  {/if}
</div>
