<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import ChoicesStep from "#lib/first-launch/ChoicesStep.svelte";
  import { deviceKindOf } from "#lib/first-launch/device.ts";
  import FoundLibraryStep from "#lib/first-launch/FoundLibraryStep.svelte";
  import { FIRST_LAUNCH_ROUTE } from "#lib/first-launch/gate.ts";
  import HomeStep from "#lib/first-launch/HomeStep.svelte";
  import LinkStep from "#lib/first-launch/LinkStep.svelte";
  import { PickerQuestion } from "#lib/first-launch/picker-question.svelte.ts";
  import { STEP_TOAST_ROOM } from "#lib/first-launch/StepFrame.svelte";
  import ReadyStep, {
    type FinishOutcome,
  } from "#lib/first-launch/ReadyStep.svelte";
  import {
    FIRST_LAUNCH_STEPS,
    type FirstLaunchStep,
    stepAfter,
  } from "#lib/first-launch/steps.ts";
  import WelcomeStep from "#lib/first-launch/WelcomeStep.svelte";
  import {
    type AdultTreatment,
    commands,
    type HomeArrival,
    type LibraryFolder,
    type LibrarySeries,
  } from "#lib/ipc/bindings.ts";
  import { NEW_ADULT_CONTENT } from "#lib/library/adult-content.ts";
  import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";
  import { addFolderWithProgress } from "#lib/library/add-folder.ts";
  import { FolderAdding } from "#lib/library/folder-adding.svelte.ts";
  import {
    homeArrivalNotice,
    takeHomeArrival,
  } from "#lib/library/home-arrival.ts";
  import { HomeFolderChange } from "#lib/library/home-folder-change.svelte.ts";
  import { LibraryFolders } from "#lib/library/library-folders.svelte.ts";
  import { SECTION_ROUTE_IDS } from "#lib/navigation/sections.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import Toasts from "#lib/notices/Toasts.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const notices = getNotices();
  const theme = getThemeSetting();

  const device = $derived(deviceKindOf(data.appInfo.platform));
  const homeArrival = arrivalToTell();
  let isLeaving = $state(false);
  let resumingAt: FirstLaunchStep | undefined = $state(stepToResumeAt());
  const step: FirstLaunchStep = $derived(
    isLeaving
      ? "ready"
      : (resumingAt ?? page.state.firstLaunchStep ?? "welcome"),
  );

  const folders = new LibraryFolders(
    commands.libraryFolders,
    commands.removeLibraryFolder,
    commands.libraryFolderBookCount,
  );

  const pickerQuestion = new PickerQuestion(
    () => data.appInfo.platform === "android",
  );
  const adding = new FolderAdding(
    addFolderWithProgress,
    () => notices,
    () => {
      void folders.load();
    },
    () => pickerQuestion.ask(),
  );

  const homeChange = new HomeFolderChange(
    {
      choose: commands.chooseHomeFolder,
      use: commands.useFoundLibrary,
      move: commands.moveHomeFolder,
    },
    () => notices,
  );
  const foundLibrary = $derived(homeChange.found?.library ?? data.foundLibrary);

  let adultTreatment: AdultTreatment = $state("blur");
  let card: HTMLElement | undefined = $state();
  let shownStep: FirstLaunchStep | undefined;

  onMount(() => {
    if (resumingAt !== undefined) {
      void resumeAt(resumingAt);
    }
    void folders.load().then(showHomeArrival);
  });

  function arrivalToTell(): HomeArrival | null {
    return takeHomeArrival(data.homeArrival);
  }

  function stepToResumeAt(): FirstLaunchStep | undefined {
    const isFreshLaunch = page.state.firstLaunchStep === undefined;
    return isFreshLaunch && homeArrival === "moved" ? "home" : undefined;
  }

  async function resumeAt(resumed: FirstLaunchStep): Promise<void> {
    await goto(resolve(FIRST_LAUNCH_ROUTE), {
      shallow: true,
      replace: true,
      state: { firstLaunchStep: "welcome" },
    });
    await goto(resolve(FIRST_LAUNCH_ROUTE), {
      shallow: true,
      state: { firstLaunchStep: resumed },
    });
    resumingAt = undefined;
  }

  function showHomeArrival(): void {
    const notice = homeArrivalNotice(
      homeArrival,
      folders.list,
      data.appInfo.platform,
    );
    if (notice !== undefined) {
      notices.show(notice);
    }
  }

  function useLibrary(): void {
    if (homeChange.found === undefined) {
      void next();
      return;
    }
    void homeChange.use();
  }

  function startNewLibrary(): void {
    if (homeChange.found === undefined) {
      void next();
      return;
    }
    homeChange.clearFound();
  }

  $effect(() => {
    if (shownStep !== undefined && shownStep !== step) {
      card?.querySelector<HTMLHeadingElement>("h1")?.focus();
    }
    shownStep = step;
  });

  async function next(): Promise<void> {
    const after = stepAfter(step);
    if (after !== undefined) {
      await goto(resolve(FIRST_LAUNCH_ROUTE), {
        shallow: true,
        state: { firstLaunchStep: after },
      });
    }
  }

  const SHELF_SIZE = 5;

  async function countSeriesIn(
    folder: LibraryFolder,
  ): Promise<number | undefined> {
    const result = await commands.folderSeriesCount(
      folder.id,
      NEW_LIBRARY_LISTING.filter,
    );
    return result.status === "ok" ? result.data : undefined;
  }

  async function shelfSeries(): Promise<readonly LibrarySeries[]> {
    const page = await commands.librarySeries(null, NEW_LIBRARY_LISTING);
    return page.status === "ok"
      ? page.data.series
          .filter((series) => series.cover !== null && !series.isAdult)
          .slice(0, SHELF_SIZE)
      : [];
  }

  async function keepAdultTreatment(): Promise<void> {
    const current = await commands.libraryAdultContent();
    const kept = await commands.setLibraryAdultContent({
      ...(current.status === "ok" ? current.data : NEW_ADULT_CONTENT),
      treatment: adultTreatment,
    });
    if (kept.status === "error") {
      reportError(kept.error);
    }
  }

  async function leaveChoices(): Promise<void> {
    await keepAdultTreatment();
    await next();
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
  class="flex justify-center bg-background min-block-dvh expanded:items-start expanded:bg-backdrop expanded:p-2xl ios:bg-ios-grouped"
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
      {:else if step === "home" && foundLibrary !== null}
        <FoundLibraryStep
          platform={data.appInfo.platform}
          folders={folders.list}
          found={foundLibrary}
          chosenLocation={homeChange.found?.location}
          isBusy={homeChange.isBusy}
          onBack={back}
          onStartNew={startNewLibrary}
          onUse={useLibrary}
          onChange={() => {
            void homeChange.choose();
          }}
        />
      {:else if step === "home"}
        <HomeStep
          platform={data.appInfo.platform}
          folders={folders.list}
          isChanging={homeChange.isBusy}
          onBack={back}
          onNext={next}
          onChange={() => {
            void homeChange.choose();
          }}
        />
      {:else if step === "link"}
        <LinkStep
          platform={data.appInfo.platform}
          {folders}
          {adding}
          {pickerQuestion}
          {notices}
          onBack={back}
          onNext={next}
        />
      {:else if step === "choices"}
        <ChoicesStep
          {device}
          {adultTreatment}
          onChooseAdult={(treatment: AdultTreatment) => {
            adultTreatment = treatment;
          }}
          onBack={back}
          onNext={() => {
            void leaveChoices();
          }}
        />
      {:else}
        <ReadyStep
          platform={data.appInfo.platform}
          {folders}
          {adding}
          {notices}
          {countSeriesIn}
          {shelfSeries}
          onFinish={finish}
        />
      {/if}
    </main>
  </div>
</div>
<div class="fixed inset-x-none inset-be-none z-notice">
  <Toasts
    {notices}
    platform={data.appInfo.platform}
    theme={theme.resolved}
    top="calc(var(--spacing-safe-top) + var(--spacing-sm))"
    bottom="calc(var({STEP_TOAST_ROOM}, var(--spacing-safe-bottom)) + var(--spacing-md))"
  />
</div>
