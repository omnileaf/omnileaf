<script lang="ts">
  import { SlidersHorizontal } from "@lucide/svelte";

  import ThemeChoice from "$lib/appearance/ThemeChoice.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import type { DeviceKind } from "./device";
  import StepBadge from "./StepBadge.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepHeader from "./StepHeader.svelte";
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
    <StepHeader scale="headline">
      {#snippet badge()}
        <StepBadge icon={SlidersHorizontal} />
      {/snippet}
      {m.first_launch_choices_title()}
    </StepHeader>
    <p class="text-muted">{m.first_launch_choices_body()}</p>
    <ThemeChoice
      title={m.first_launch_choices_appearance()}
      hint={appearanceHelp === undefined ? undefined : appearanceHelpText}
    />
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
  {/snippet}
</StepFrame>
