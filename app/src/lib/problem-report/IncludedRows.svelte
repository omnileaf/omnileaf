<script lang="ts">
  import { Info, ScrollText } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { ProblemReportPreview } from "#lib/ipc/bindings.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";

  import IncludedRow from "./IncludedRow.svelte";

  let { report }: { report: ProblemReportPreview } = $props();

  const logId = $props.id();
  let isLogShown = $state(false);

  const version = $derived(
    report.system === null
      ? report.version
      : m.report_version_on_system({
          version: report.version,
          system: report.system,
        }),
  );
  const logHint = $derived(
    report.log.length === 0
      ? m.report_log_empty()
      : m.report_log_hint({ count: report.log.length }),
  );
</script>

<section
  aria-label={m.report_included()}
  class={[
    "flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card",
    GROUP_PLATE,
  ]}
>
  <IncludedRow
    icon={Info}
    label={m.report_version_and_device()}
    hint={version}
  />
  <div class="flex flex-col">
    <IncludedRow icon={ScrollText} label={m.report_log()} hint={logHint}>
      {#snippet action()}
        {#if report.log.length > 0}
          <Button
            look="bar-icon"
            aria-expanded={isLogShown}
            aria-controls={logId}
            class="-me-sm shrink-0 px-md font-medium min-block-touch-target desktop:px-sm desktop:text-small desktop:min-block-pointer-target"
            onclick={() => {
              isLogShown = !isLogShown;
            }}
          >
            {isLogShown ? m.report_log_hide() : m.report_log_show()}
          </Button>
        {/if}
      {/snippet}
    </IncludedRow>
    {#if isLogShown}
      <pre
        id={logId}
        role="region"
        aria-label={m.report_log()}
        class="mx-lg mbe-md rounded-card bg-well px-list-row py-md font-mono text-code wrap-anywhere whitespace-pre-wrap select-text">{report.log.join(
          "\n",
        )}</pre>
    {/if}
  </div>
</section>
