<script lang="ts">
  import { SlidersHorizontal } from "@lucide/svelte";

  import ThemeChoice from "#lib/appearance/ThemeChoice.svelte";
  import type { AdultTreatment } from "#lib/ipc/bindings.ts";
  import WidthWording from "#lib/page/WidthWording.svelte";
  import { atEveryWidth, type WordingByWidth } from "#lib/page/wording.ts";
  import { m } from "#lib/paraglide/messages.js";

  import CoversChoice from "./CoversChoice.svelte";
  import StepButton from "./StepButton.svelte";
  import type { DeviceKind } from "./device";
  import StepBadge from "./StepBadge.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepHeader from "./StepHeader.svelte";

  let {
    device,
    adultTreatment,
    onChooseAdult,
    onBack,
    onNext,
  }: {
    device: DeviceKind;
    adultTreatment: AdultTreatment;
    onChooseAdult: (treatment: AdultTreatment) => void;
    onBack: () => void;
    onNext: () => void;
  } = $props();

  const APPEARANCE_HELP = {
    phone: {
      onPhones: m.first_launch_choices_appearance_help_phone,
      fromMedium: m.first_launch_choices_appearance_help_tablet,
    },
    desktop: atEveryWidth(m.first_launch_choices_appearance_help_desktop),
  } satisfies Record<DeviceKind, WordingByWidth>;

  const appearanceHelp = $derived(APPEARANCE_HELP[device]);
</script>

{#snippet appearanceHelpText()}
  <WidthWording wording={appearanceHelp} />
{/snippet}

<StepFrame step="choices" {onBack}>
  <StepHeader>
    {#snippet badge()}
      <StepBadge icon={SlidersHorizontal} />
    {/snippet}
    {m.first_launch_choices_title()}
    {#snippet lead()}
      {m.first_launch_choices_body()}
    {/snippet}
  </StepHeader>
  <ThemeChoice
    title={m.first_launch_choices_appearance()}
    placement="first-launch"
    hint={appearanceHelpText}
  />
  <CoversChoice chosen={adultTreatment} onChoose={onChooseAdult} />
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
  {/snippet}
</StepFrame>
