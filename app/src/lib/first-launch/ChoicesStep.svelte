<script lang="ts">
  import ThemeChoice from "$lib/appearance/ThemeChoice.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";

  let { onBack, onNext }: { onBack: () => void; onNext: () => void } = $props();
</script>

<StepFrame step="choices" {onBack}>
  <div class="flex flex-col gap-lg">
    <h1 tabindex="-1" class="text-headline font-bold">
      {m.first_launch_choices_title()}
    </h1>
    <p class="text-muted">{m.first_launch_choices_body()}</p>
    <ThemeChoice legend={m.first_launch_choices_appearance()} />
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
  {/snippet}
</StepFrame>
