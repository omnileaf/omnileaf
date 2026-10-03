<script lang="ts">
  import { goto, pushState } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { deviceKindOf } from "$lib/first-launch/device";
  import ReadyStep, {
    type FinishOutcome,
  } from "$lib/first-launch/ReadyStep.svelte";
  import { type FirstLaunchStep, stepAfter } from "$lib/first-launch/steps";
  import WelcomeStep from "$lib/first-launch/WelcomeStep.svelte";
  import { commands } from "$lib/ipc/bindings";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const device = $derived(deviceKindOf(data.appInfo.platform));
  const step: FirstLaunchStep = $derived(
    page.state.firstLaunchStep ?? "welcome",
  );

  let card: HTMLElement | undefined = $state();
  let shownStep: FirstLaunchStep | undefined;

  $effect(() => {
    if (shownStep !== undefined && shownStep !== step) {
      card?.querySelector<HTMLHeadingElement>("h1")?.focus();
    }
    shownStep = step;
  });

  function next(): void {
    const after = stepAfter(step);
    if (after !== undefined) {
      pushState("", { firstLaunchStep: after });
    }
  }

  async function finish(): Promise<FinishOutcome> {
    const result = await commands.finishFirstLaunch();
    if (result.status === "error") {
      return "failed";
    }
    await goto(resolve("/"), { replaceState: true, invalidateAll: true });
    return "finished";
  }
</script>

<div
  class="flex bg-background min-block-dvh medium:items-center medium:justify-center medium:bg-backdrop medium:p-xl"
>
  <div
    bind:this={card}
    class="flex flex-1 medium:flex-none medium:overflow-hidden medium:rounded-sheet medium:border medium:border-border medium:bg-background medium:shadow-card medium:inline-full medium:max-inline-first-launch-card medium:min-block-first-launch-card-tall"
  >
    <main
      class="flex flex-1 flex-col ps-page-start pe-page-end pbs-safe-top pbe-page-bottom medium:p-2xl"
    >
      {#if step === "welcome"}
        <WelcomeStep {device} onNext={next} />
      {:else}
        <ReadyStep onFinish={finish} />
      {/if}
    </main>
  </div>
</div>
