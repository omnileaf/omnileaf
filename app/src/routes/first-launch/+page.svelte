<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import ChoicesStep from "#lib/first-launch/ChoicesStep.svelte";
  import { deviceKindOf } from "#lib/first-launch/device.ts";
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
  import { SECTION_ROUTE_IDS } from "#lib/navigation/sections.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import Toasts from "#lib/notices/Toasts.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const notices = getNotices();
  const theme = getThemeSetting();

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

  async function next(): Promise<void> {
    const after = stepAfter(step);
    if (after !== undefined) {
      await goto("", { shallow: true, state: { firstLaunchStep: after } });
    }
  }

  function back(): void {
    window.history.back();
  }

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
    await goto(resolve(SECTION_ROUTE_IDS.library), {
      replace: true,
      refreshAll: true,
    });
    return "finished";
  }
</script>

<div
  class="flex justify-center bg-background min-block-dvh expanded:items-start expanded:bg-backdrop expanded:p-2xl"
>
  <div
    bind:this={card}
    class="flex flex-1 max-inline-first-launch-card min-inline-none expanded:flex-none expanded:rounded-sheet expanded:border expanded:border-border expanded:bg-background expanded:shadow-card expanded:inline-first-launch-card"
  >
    <main
      class="flex flex-1 flex-col pbs-safe-top min-inline-none expanded:pbs-none"
    >
      {#if step === "welcome"}
        <WelcomeStep {device} onNext={next} />
      {:else if step === "home"}
        <HomeStep
          platform={data.appInfo.platform}
          folders={folders.list}
          onBack={back}
          onNext={next}
        />
      {:else if step === "link"}
        <LinkStep
          platform={data.appInfo.platform}
          {folders}
          addFolder={addFolderWithProgress}
          {notices}
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
  <Toasts {notices} platform={data.appInfo.platform} theme={theme.resolved} />
</div>
