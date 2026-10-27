<script lang="ts">
  import { House } from "@lucide/svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import { folderLocation } from "#lib/library/folder-location.ts";
  import type { FolderList } from "#lib/library/library-folders.svelte.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ChangeHomeButton from "./ChangeHomeButton.svelte";
  import HomeCard, { type HomeFact } from "./HomeCard.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepHeader from "./StepHeader.svelte";

  let {
    platform,
    folders,
    isChanging,
    onBack,
    onNext,
    onChange,
  }: {
    platform: Platform;
    folders: FolderList;
    isChanging: boolean;
    onBack: () => void;
    onNext: () => void;
    onChange: () => void;
  } = $props();

  const IN_A_FOLDER: readonly HomeFact[] = [
    {
      term: m.first_launch_home_keeps(),
      detail: m.first_launch_home_keeps_detail(),
    },
    {
      term: m.first_launch_home_also_holds(),
      detail: m.first_launch_home_also_holds_detail(),
    },
    {
      term: m.first_launch_home_your_comics(),
      detail: m.first_launch_home_your_comics_detail(),
    },
  ];
  const IN_FILES: readonly HomeFact[] = [
    {
      term: m.first_launch_home_keeps(),
      detail: m.first_launch_home_keeps_detail_ios(),
    },
    {
      term: m.first_launch_home_in_the_app(),
      detail: m.first_launch_home_in_the_app_detail(),
    },
    {
      term: m.first_launch_home_your_comics(),
      detail: m.first_launch_home_your_comics_detail(),
    },
  ];

  const isInFiles = $derived(platform === "ios");
  const canChange = $derived(isPointer(platform));

  function leadText(): string {
    if (isInFiles) {
      return m.first_launch_home_body_ios();
    }
    return canChange
      ? m.first_launch_home_body_desktop()
      : m.first_launch_home_body();
  }
</script>

<StepFrame step="home" {onBack}>
  <StepHeader>
    {#snippet badge()}
      <StepBadge icon={House} />
    {/snippet}
    {isInFiles ? m.first_launch_home_title_ios() : m.first_launch_home_title()}
    {#snippet lead()}
      {leadText()}
    {/snippet}
  </StepHeader>
  {#if folders.kind === "loaded" && folders.home !== undefined}
    <HomeCard
      title={isInFiles
        ? m.first_launch_home_in_files()
        : m.library_settings_home_folder()}
      location={folderLocation(folders.home, platform)}
      facts={isInFiles ? IN_FILES : IN_A_FOLDER}
    >
      {#snippet change()}
        {#if canChange}
          <ChangeHomeButton {platform} isBusy={isChanging} onclick={onChange} />
        {/if}
      {/snippet}
    </HomeCard>
    {#if canChange}
      <p class="px-xs text-footnote text-muted">
        {m.first_launch_home_note_desktop()}
      </p>
    {/if}
  {/if}
  {#if folders.kind === "failed"}
    <p class="px-xs">{m.library_folders_failed()}</p>
  {/if}
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
  {/snippet}
</StepFrame>
