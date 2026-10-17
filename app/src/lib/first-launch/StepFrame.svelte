<script module lang="ts">
  export const STEP_TOAST_ROOM = "--step-toast-room";
</script>

<script lang="ts">
  import { ArrowLeft, ChevronLeft } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { makesToastRoom } from "#lib/notices/toast-room.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import StepProgress from "./StepProgress.svelte";
  import { type FirstLaunchStep, numberOf } from "./steps";

  const BACK_ICON_SIZE = 24;

  let {
    step,
    onBack,
    children,
    actions,
  }: {
    step: FirstLaunchStep;
    onBack?: () => void;
    children: Snippet;
    actions: Snippet;
  } = $props();

  const position = $derived(numberOf(step));
  const isDialog = new MediaQuery(EXPANDED_QUERY);
</script>

{#if position !== undefined}
  <header
    class="flex items-center gap-sm p-sm min-block-row expanded:px-step-dialog-inline expanded:pbs-step-dialog-block expanded:pbe-none expanded:min-block-none"
  >
    {#if onBack !== undefined}
      <button
        type="button"
        class="flex shrink-0 items-center justify-center rounded-full transition-control min-block-touch-target min-inline-touch-target hover:bg-hover active:bg-pressed expanded:hidden ios:gap-2xs ios:ps-2xs ios:pe-sm ios:text-accent"
        onclick={onBack}
      >
        <ArrowLeft
          size={BACK_ICON_SIZE}
          aria-hidden="true"
          class="rtl:-scale-x-100 ios:hidden"
        />
        <ChevronLeft
          size={BACK_ICON_SIZE}
          aria-hidden="true"
          class="hidden rtl:-scale-x-100 ios:block"
        />
        <span class="sr-only ios:not-sr-only">{m.first_launch_back()}</span>
      </button>
    {/if}
    <StepProgress {position} />
  </header>
{/if}
<div
  class={[
    "flex flex-1 flex-col gap-lg px-xl pbs-sm pbe-lg expanded:flex-none expanded:px-step-dialog-inline expanded:pbs-xl expanded:pbe-xl",
    position === undefined &&
      "pbs-step-open-top expanded:pbs-step-dialog-block",
  ]}
>
  {@render children()}
</div>
<footer
  {@attach !isDialog.current && makesToastRoom(STEP_TOAST_ROOM)}
  class="flex flex-col gap-xs px-xl pbs-sm pbe-sheet-bottom expanded:flex-row expanded:items-center expanded:gap-sm expanded:px-step-dialog-inline expanded:pbe-step-dialog-block"
>
  {#if onBack !== undefined}
    <span class="hidden expanded:contents">
      <StepButton kind="outline" onclick={onBack}>
        {m.first_launch_back()}
      </StepButton>
    </span>
  {/if}
  <div
    class="flex flex-col gap-step-actions expanded:ms-auto expanded:flex-row-reverse expanded:items-center expanded:gap-sm"
  >
    {@render actions()}
  </div>
</footer>
