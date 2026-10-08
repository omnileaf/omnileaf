<script lang="ts">
  import { onMount } from "svelte";

  import { goto, pushState } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import ChoicesStep from "#lib/first-launch/ChoicesStep.svelte";
  import { deviceKindOf } from "#lib/first-launch/device.ts";
  import FirstLaunchPanel from "#lib/first-launch/FirstLaunchPanel.svelte";
  import HomeStep from "#lib/first-launch/HomeStep.svelte";
  import LinkStep from "#lib/first-launch/LinkStep.svelte";
  import ReadyStep, {
    type FinishOutcome,
  } from "#lib/first-launch/ReadyStep.svelte";
  import {
    FIRST_LAUNCH_STEPS,
    type FirstLaunchStep,
    stepAfter,
  } from "#lib/first-launch/steps.ts";
  import WelcomeStep from "#lib/first-launch/WelcomeStep.svelte";
  import { commands } from "#lib/ipc/bindings.ts";
  import { addFolderWithProgress } from "#lib/library/add-folder.ts";
  import { LibraryFolders } from "#lib/library/library-folders.svelte.ts";
  import NoticeHost from "#lib/notices/NoticeHost.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const device = $derived(deviceKindOf(data.appInfo.platform));
  let isLeaving = $state(false);
  const step: FirstLaunchStep = $derived(
    isLeaving ? "ready" : (page.state.firstLaunchStep ?? "welcome"),
  );

  const folders = new LibraryFolders(
    commands.libraryFolders,
    commands.removeLibraryFolder,
    commands.libraryFolderBookCount,
  );

  let card: HTMLElement | undefined = $state();
  let shownStep: FirstLaunchStep | undefined;

  onMount(() => {
    void folders.load();
  });

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

  function back(): void {
    window.history.back();
  }

  /** Goes back to the entry the first launch opened on, so the library replaces it and back leaves the app instead of replaying the steps. */
  function dropStepEntries(): Promise<void> {
    const stepEntries = FIRST_LAUNCH_STEPS.indexOf(step);
    if (stepEntries === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.addEventListener(
        "popstate",
        () => {
          resolve();
        },
        { once: true },
      );
      window.history.go(-stepEntries);
    });
  }

  async function finish(): Promise<FinishOutcome> {
    const result = await commands.finishFirstLaunch();
    if (result.status === "error") {
      return "failed";
    }
    isLeaving = true;
    await dropStepEntries();
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
    <FirstLaunchPanel />
    <main
      class="flex flex-1 flex-col ps-page-start pe-page-end pbs-safe-top pbe-page-bottom medium:p-2xl"
    >
      {#if step === "welcome"}
        <WelcomeStep {device} onNext={next} />
      {:else if step === "home"}
        <HomeStep folders={folders.list} onBack={back} onNext={next} />
      {:else if step === "link"}
        <LinkStep
          platform={data.appInfo.platform}
          {folders}
          addFolder={addFolderWithProgress}
          notices={data.notices}
          onBack={back}
          onNext={next}
        />
      {:else if step === "choices"}
        <ChoicesStep {device} onBack={back} onNext={next} />
      {:else}
        <ReadyStep onFinish={finish} />
      {/if}
    </main>
  </div>
</div>
<div class="fixed inset-x-none inset-be-safe-bottom z-notice">
  <NoticeHost notices={data.notices} platform={data.appInfo.platform} />
</div>
