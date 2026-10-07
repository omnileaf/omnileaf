<script lang="ts">
  import { ArrowLeft, ChevronLeft } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { m } from "$lib/paraglide/messages.js";

  import { type FirstLaunchStep, numberOf } from "./steps";
  import StepProgress from "./StepProgress.svelte";

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
</script>

{#if position !== undefined}
  <header class="flex items-center gap-sm min-block-touch-target medium:mbe-xl">
    {#if onBack !== undefined}
      <button
        type="button"
        class="flex items-center justify-center rounded-full transition-control min-block-touch-target min-inline-touch-target hover:bg-hover active:bg-pressed medium:hidden ios:gap-2xs ios:pe-sm ios:text-accent"
        onclick={onBack}
      >
        <ArrowLeft
          size={BACK_ICON_SIZE}
          aria-hidden="true"
          class="ios:hidden"
        />
        <ChevronLeft
          size={BACK_ICON_SIZE}
          aria-hidden="true"
          class="hidden ios:block"
        />
        <span class="sr-only ios:not-sr-only">{m.first_launch_back()}</span>
      </button>
    {/if}
    <StepProgress {position} />
  </header>
{/if}
<div class="flex flex-1 flex-col pbs-xl medium:pbs-none">
  {@render children()}
</div>
<div class="flex flex-col gap-xs pbs-xl medium:flex-row medium:items-center">
  {#if onBack !== undefined}
    <button
      type="button"
      class="hidden rounded-control border border-border px-lg font-semibold transition-control min-block-touch-target hover:bg-hover active:bg-pressed medium:block"
      onclick={onBack}
    >
      {m.first_launch_back()}
    </button>
  {/if}
  <div
    class={[
      "flex flex-col gap-xs medium:flex-row-reverse medium:gap-sm",
      onBack !== undefined && "medium:ms-auto",
    ]}
  >
    {@render actions()}
  </div>
</div>
