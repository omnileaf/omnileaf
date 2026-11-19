<script module lang="ts">
  export const STEP_TOAST_ROOM = "--step-toast-room";
</script>

<script lang="ts">
  import { ArrowLeft, ChevronLeft } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { makesToastRoom } from "#lib/notices/toast-room.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { NATIVE_TOP_BAR } from "#lib/page/top-bar.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { usesSetupPages } from "./setup-pages.ts";
  import StepButton from "./StepButton.svelte";
  import StepProgress from "./StepProgress.svelte";
  import { type FirstLaunchStep, numberOf } from "./steps";

  const BACK_ICON_SIZE = 24;
  const SETUP_BACK_ICON_SIZE = 16;

  type FrameTop =
    { step: FirstLaunchStep; title?: never } | { title: string; step?: never };

  let {
    step,
    title,
    onBack,
    children,
    actions,
  }: FrameTop & {
    onBack?: () => void;
    children: Snippet;
    actions?: Snippet;
  } = $props();

  const position = $derived(step === undefined ? undefined : numberOf(step));
  const isDialog = new MediaQuery(EXPANDED_QUERY);
  const isSetupPage = usesSetupPages(currentPlatform());
  const hasTopBar = $derived(title !== undefined || position !== undefined);
  const hasFooter = $derived(
    actions !== undefined || (onBack !== undefined && isDialog.current),
  );
</script>

{#snippet barTitle(text: string)}
  <h1 tabindex="-1" class={["min-inline-none", NATIVE_TOP_BAR.barTitle]}>
    {text}
  </h1>
{/snippet}

{#if isSetupPage}
  {#if hasTopBar}
    <header
      class="flex shrink-0 items-center gap-md ps-sm pe-lg pbs-sm min-block-setup-top"
    >
      {#if onBack !== undefined}
        <Button
          type="button"
          variant="plain"
          iconOnly
          label={m.first_launch_back()}
          onclick={onBack}
        >
          <ArrowLeft size={SETUP_BACK_ICON_SIZE} aria-hidden="true" />
        </Button>
      {/if}
      {#if title !== undefined}
        {@render barTitle(title)}
      {:else if position !== undefined}
        <div class="ms-auto">
          <StepProgress {position} />
        </div>
      {/if}
    </header>
  {/if}
  <div
    class={[
      "flex flex-1 justify-center overflow-y-auto px-xl pbe-xl",
      hasTopBar ? "pbs-sm" : "pbs-setup-first-top",
    ]}
  >
    <div class="flex flex-col gap-xl inline-full max-inline-setup-column">
      {@render children()}
    </div>
  </div>
  {#if actions !== undefined}
    <footer
      {@attach makesToastRoom(STEP_TOAST_ROOM)}
      class="flex shrink-0 flex-row-reverse flex-wrap justify-start gap-sm border-bs border-border px-xl py-lg"
    >
      {@render actions()}
    </footer>
  {/if}
{:else}
  {#if hasTopBar}
    <header
      class="flex items-center gap-sm p-sm min-block-row expanded:px-step-dialog-inline expanded:pbs-step-dialog-block expanded:pbe-none expanded:min-block-none android:gap-md"
    >
      {#if onBack !== undefined}
        <button
          type="button"
          class="native-target flex shrink-0 items-center justify-center rounded-full transition-control min-block-touch-target min-inline-touch-target hover:bg-hover active:bg-pressed expanded:hidden ios:gap-2xs ios:ps-2xs ios:pe-sm ios:text-accent android:block-native-button android:inline-native-button android:min-block-auto android:min-inline-auto"
          onclick={onBack}
        >
          {#if currentPlatform() === "android"}
            <Icon
              name="arrow-left"
              size={BACK_ICON_SIZE}
              class="rtl:-scale-x-100"
            />
          {:else}
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
          {/if}
          <span class="sr-only ios:not-sr-only">{m.first_launch_back()}</span>
        </button>
      {/if}
      {#if title !== undefined}
        {@render barTitle(title)}
      {:else if position !== undefined}
        <StepProgress {position} />
      {/if}
    </header>
  {/if}
  <div
    class={[
      "flex flex-1 flex-col gap-lg px-xl pbs-sm expanded:flex-none expanded:px-step-dialog-inline expanded:pbs-xl expanded:pbe-xl",
      hasFooter ? "pbe-lg" : "pbe-sheet-bottom",
      !hasTopBar && "pbs-step-open-top expanded:pbs-step-dialog-block",
    ]}
  >
    {@render children()}
  </div>
  {#if hasFooter}
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
      {#if actions !== undefined}
        <div
          class="flex flex-col gap-step-actions expanded:ms-auto expanded:flex-row-reverse expanded:items-center expanded:gap-sm"
        >
          {@render actions()}
        </div>
      {/if}
    </footer>
  {/if}
{/if}
