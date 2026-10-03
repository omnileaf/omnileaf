<script lang="ts" module>
  export type FinishOutcome = "finished" | "failed";
</script>

<script lang="ts">
  import { Check } from "@lucide/svelte";

  import { m } from "$lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepIcon from "./StepIcon.svelte";

  const HERO_ICON_SIZE = 34;

  let { onFinish }: { onFinish: () => Promise<FinishOutcome> } = $props();

  let outcome: FinishOutcome | "finishing" | undefined = $state();

  async function finish(): Promise<void> {
    outcome = "finishing";
    outcome = await onFinish();
  }
</script>

<StepFrame step="ready">
  <div class="flex flex-1 flex-col justify-center gap-lg">
    <StepIcon tone="strong">
      <Check size={HERO_ICON_SIZE} aria-hidden="true" />
    </StepIcon>
    <h1 tabindex="-1" class="text-headline font-bold">
      {m.first_launch_ready_title()}
    </h1>
    <p class="text-muted">{m.first_launch_ready_body()}</p>
    {#if outcome === "failed"}
      <p role="alert">{m.first_launch_finish_failed()}</p>
    {/if}
  </div>
  {#snippet actions()}
    <StepButton
      kind="primary"
      disabled={outcome === "finishing"}
      onclick={() => {
        void finish();
      }}
    >
      {m.first_launch_open_library()}
    </StepButton>
  {/snippet}
</StepFrame>
