<script lang="ts">
  import { House } from "@lucide/svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import { folderLocation } from "#lib/library/folder-location.ts";
  import type { FolderList } from "#lib/library/library-folders.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import HomeCard, { type HomeFact } from "./HomeCard.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepHeader from "./StepHeader.svelte";

  let {
    platform,
    folders,
    onBack,
    onNext,
  }: {
    platform: Platform;
    folders: FolderList;
    onBack: () => void;
    onNext: () => void;
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
</script>

<StepFrame step="home" {onBack}>
  <StepHeader>
    {#snippet badge()}
      <StepBadge icon={House} />
    {/snippet}
    {isInFiles ? m.first_launch_home_title_ios() : m.first_launch_home_title()}
    {#snippet lead()}
      {isInFiles ? m.first_launch_home_body_ios() : m.first_launch_home_body()}
    {/snippet}
  </StepHeader>
  {#if folders.kind === "loaded" && folders.home !== undefined}
    <HomeCard
      title={isInFiles
        ? m.first_launch_home_in_files()
        : m.library_settings_home_folder()}
      location={folderLocation(folders.home, platform)}
      facts={isInFiles ? IN_FILES : IN_A_FOLDER}
    />
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
