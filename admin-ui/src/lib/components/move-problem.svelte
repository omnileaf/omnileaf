<script lang="ts">
  import CircleAlert from "@lucide/svelte/icons/circle-alert";

  import { cn } from "#lib/cn.ts";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { WRAPPING_LABEL } from "#lib/components/wrapping-label.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import { copy } from "#lib/copy.ts";
  import type { MoveRecovery } from "#lib/move-failure.ts";
  import {
    PROBLEM_ID,
    PROBLEM_MESSAGE_ID,
    PROBLEM_TITLE_ID,
  } from "#lib/move-ids.ts";

  let {
    message,
    recoveries,
    onRetry,
    onReload,
  }: {
    message: string;
    recoveries: readonly MoveRecovery[];
    onRetry: () => void;
    onReload: () => void;
  } = $props();

  const RECOVERY_LABELS = {
    reload: copy.moves.reload,
    retry: copy.shell.retry,
  } satisfies Record<MoveRecovery, string>;
</script>

<Alert
  icon={CircleAlert}
  role="note"
  id={PROBLEM_ID}
  tabindex={-1}
  aria-labelledby={PROBLEM_TITLE_ID}
  aria-describedby={PROBLEM_MESSAGE_ID}
  class={cn("mbe-4", FOCUS_RING)}
>
  <AlertTitle id={PROBLEM_TITLE_ID}>{copy.moves.problemTitle}</AlertTitle>
  <AlertDescription id={PROBLEM_MESSAGE_ID}>{message}</AlertDescription>
  {#if recoveries.length > 0}
    <div class="mbs-2 flex flex-wrap gap-2">
      {#each recoveries as recovery (recovery)}
        <Button
          variant="outline"
          class={WRAPPING_LABEL}
          onclick={recovery === "retry" ? onRetry : onReload}
        >
          {RECOVERY_LABELS[recovery]}
        </Button>
      {/each}
    </div>
  {/if}
</Alert>
