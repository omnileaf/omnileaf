<script lang="ts" module>
  export type FinishOutcome = "finished" | "failed";
</script>

<script lang="ts">
  import { Check } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepHeader from "./StepHeader.svelte";

  let { onFinish }: { onFinish: () => Promise<FinishOutcome> } = $props();

  let outcome: FinishOutcome | "finishing" | undefined = $state();

  async function finish(): Promise<void> {
    outcome = "finishing";
    outcome = await onFinish();
  }
</script>

<StepFrame step="ready">
  <StepHeader>
    {#snippet badge()}
      <StepBadge icon={Check} />
    {/snippet}
    {m.first_launch_ready_title()}
    {#snippet lead()}
      {m.first_launch_ready_body()}
    {/snippet}
  </StepHeader>
  {#if outcome === "failed"}
    <p role="alert" class="text-center">{m.first_launch_finish_failed()}</p>
  {/if}
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
