<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperSeparator,
    StepperTitle,
    StepperTrigger,
  } from "#lib/components/ui/stepper/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    type FirstLaunchStep,
    NUMBERED_STEPS,
    type NumberedStep,
    numberOf,
  } from "./steps";

  const NAMES = {
    home: m.first_launch_step_home,
    link: m.first_launch_step_link,
    choices: m.first_launch_step_choices,
  } satisfies Record<NumberedStep, () => string>;

  let {
    step,
    onBackTo,
    children,
    actions,
  }: {
    step: FirstLaunchStep;
    onBackTo?: (step: FirstLaunchStep) => void;
    children: Snippet;
    actions: Snippet;
  } = $props();

  const position = $derived(numberOf(step));

  function goBackTo(chosen: number): void {
    const earlier = NUMBERED_STEPS[chosen - 1];
    if (earlier !== undefined) {
      onBackTo?.(earlier);
    }
  }
</script>

{#if position !== undefined}
  <header class="pbs-xs medium:mbe-xl">
    <Stepper bind:step={() => position.number, goBackTo}>
      <StepperNav aria-label={m.first_launch_progress_label()}>
        {#each NUMBERED_STEPS as numbered, index (numbered)}
          <StepperItem>
            <StepperTrigger
              aria-label={m.first_launch_step_position({
                name: NAMES[numbered](),
                number: index + 1,
                count: position.count,
              })}
            >
              <StepperIndicator />
              <StepperTitle>{NAMES[numbered]()}</StepperTitle>
            </StepperTrigger>
            <StepperSeparator />
          </StepperItem>
        {/each}
      </StepperNav>
    </Stepper>
  </header>
{/if}
<div class="flex flex-1 flex-col pbs-xl medium:pbs-none">
  {@render children()}
</div>
<div class="flex flex-col gap-xs pbs-xl medium:flex-row medium:items-center">
  <div
    class={[
      "flex flex-col gap-xs medium:flex-row-reverse medium:gap-sm",
      position !== undefined && "medium:ms-auto",
    ]}
  >
    {@render actions()}
  </div>
</div>
