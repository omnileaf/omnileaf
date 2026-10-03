<script lang="ts">
  import ThemeChoice from "$lib/appearance/ThemeChoice.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import type { DeviceKind } from "./device";
  import StepFrame from "./StepFrame.svelte";
  import WidthWording from "./WidthWording.svelte";
  import type { WordingByWidth } from "./wording";

  let {
    device,
    onBack,
    onNext,
  }: { device: DeviceKind; onBack: () => void; onNext: () => void } = $props();

  const APPEARANCE_HELP = {
    phone: {
      onPhones: m.first_launch_choices_appearance_help_phone,
      fromMedium: m.first_launch_choices_appearance_help_tablet,
    },
    desktop: undefined,
  } satisfies Record<DeviceKind, WordingByWidth | undefined>;

  const appearanceHelp = $derived(APPEARANCE_HELP[device]);
</script>

{#snippet appearanceHelpText()}
  {#if appearanceHelp !== undefined}
    <WidthWording wording={appearanceHelp} />
  {/if}
{/snippet}

<StepFrame step="choices" {onBack}>
  <div class="flex flex-col gap-lg">
    <h1 tabindex="-1" class="text-headline font-bold">
      {m.first_launch_choices_title()}
    </h1>
    <p class="text-muted">{m.first_launch_choices_body()}</p>
    <ThemeChoice
      legend={m.first_launch_choices_appearance()}
      help={appearanceHelp === undefined ? undefined : appearanceHelpText}
    />
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
  {/snippet}
</StepFrame>
