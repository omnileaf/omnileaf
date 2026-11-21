<script lang="ts">
  import { Info, ScrollText } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { ProblemReportPreview } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import IncludedRow from "./IncludedRow.svelte";
  import { CurrentReportRowsLook, REPORT_LISTS } from "./report-rows-look.ts";

  let { report }: { report: ProblemReportPreview } = $props();

  const logId = $props.id();
  const rowsLook = new CurrentReportRowsLook();
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

<section data-settings-group aria-label={m.report_included()}>
  <ul class={REPORT_LISTS[rowsLook.current]}>
    <IncludedRow
      icon={Info}
      iconName="info"
      label={m.report_version_and_device()}
      hint={version}
    />
    <IncludedRow
      icon={ScrollText}
      iconName="scroll-text"
      label={m.report_log()}
      hint={logHint}
    >
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
      {#if isLogShown}
        <pre
          id={logId}
          role="region"
          aria-label={m.report_log()}
          class="mx-lg mbe-md rounded-card bg-well px-list-row py-md font-mono text-code wrap-anywhere whitespace-pre-wrap select-text">{report.log.join(
            "\n",
          )}</pre>
      {/if}
    </IncludedRow>
  </ul>
</section>
