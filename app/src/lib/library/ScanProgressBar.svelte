<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";

  import { scanCount, scanFill } from "./scan-count.svelte";
  import type { ScanStep } from "./scan-step";

  let {
    step,
    titleId,
    class: className,
  }: { step: ScanStep; titleId: string; class?: string } = $props();

  const countId = $props.id();
  const count = scanCount(() => step);
</script>

{#if count.label !== undefined}
  <p id={countId} class="text-caption text-muted tabular-nums">
    {count.label}
  </p>
{/if}
<Progress
  aria-labelledby={titleId}
  aria-describedby={count.label === undefined ? undefined : countId}
  {...scanFill(step)}
  class={cn("mbs-sm basis-full", className)}
/>
