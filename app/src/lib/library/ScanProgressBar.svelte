<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import { useRamp } from "#lib/hooks/use-ramp.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { ScanStep } from "./scan-step";

  const SHARE_OF_GAP_PER_STEP = 3;

  let {
    step,
    titleId,
    class: className,
  }: { step: ScanStep; titleId: string; class?: string } = $props();

  const countId = $props.id();

  const foundSoFar = $derived(step.kind === "finding" ? step.found : 0);
  let foundShown = $state(0);

  const easing = useRamp({
    increment: () => {
      foundShown += Math.ceil(
        (foundSoFar - foundShown) / SHARE_OF_GAP_PER_STEP,
      );
    },
    canRamp: () => foundShown < foundSoFar,
    startDelay: 0,
    maxFrequency: 40,
    minFrequency: 16,
    rampUpTime: 500,
  });

  $effect(() => {
    if (foundShown < foundSoFar && !easing.active) {
      easing.start();
    }
  });

  $effect(() => easing.reset);

  const fill = $derived(
    step.kind === "reading"
      ? { value: step.scanned, max: step.total }
      : { value: null },
  );

  const count = $derived.by(() => {
    if (step.kind === "reading") {
      return m.library_scan_progress({
        scanned: step.scanned,
        total: step.total,
      });
    }
    return foundShown > 0
      ? m.library_scan_found_so_far({ found: foundShown })
      : undefined;
  });
</script>

{#if count !== undefined}
  <p id={countId} class="text-caption text-muted tabular-nums">{count}</p>
{/if}
<Progress
  aria-labelledby={titleId}
  aria-describedby={count === undefined ? undefined : countId}
  {...fill}
  class={cn("mbs-sm basis-full", className)}
/>
