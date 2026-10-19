<script lang="ts">
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import Spinner from "#lib/components/ui/spinner/spinner.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import type { CountingLook } from "./counting-look";
  import type { FolderOutcome } from "./folder-adding.svelte";
  import { scanFill } from "./scan-count.svelte";
  import type { ScanStep } from "./scan-step";

  const SPINNER_SIZE = 12;
  const NOTHING_FOUND_YET: ScanStep = { kind: "finding", found: 0 };

  let {
    outcome,
    look = "words",
  }: { outcome: FolderOutcome; look?: CountingLook } = $props();

  const step = $derived(
    outcome.kind === "finding" || outcome.kind === "reading"
      ? outcome
      : NOTHING_FOUND_YET,
  );

  const label = $derived.by(() => {
    if (step.kind === "reading") {
      return m.library_scan_progress({
        scanned: step.scanned,
        total: step.total,
      });
    }
    return step.found > 0
      ? m.library_folder_counting_so_far({ found: step.found })
      : m.library_folder_counting();
  });
</script>

<span class="flex items-center gap-xs text-foreground">
  <Spinner size={SPINNER_SIZE} class="shrink-0" />
  {label}
</span>
{#if look === "words-and-bar"}
  <Progress
    aria-hidden="true"
    {...scanFill(step)}
    class="mbs-xs block-progress-thin"
  />
{/if}
