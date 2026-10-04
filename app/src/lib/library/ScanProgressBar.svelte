<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import type { ScanStep } from "./scan-step";

  let { step, titleId }: { step: ScanStep; titleId: string } = $props();

  const countId = $props.id();
</script>

{#if step.kind === "finding"}
  <progress aria-labelledby={titleId} class="mbs-sm progress-track"></progress>
{:else if step.kind === "reading"}
  <progress
    aria-labelledby={titleId}
    aria-describedby={countId}
    class="mbs-sm progress-track"
    max={step.total}
    value={step.scanned}
  ></progress>
  <p id={countId} class="mbs-xs text-caption text-muted">
    {m.library_scan_progress({ scanned: step.scanned, total: step.total })}
  </p>
{/if}
