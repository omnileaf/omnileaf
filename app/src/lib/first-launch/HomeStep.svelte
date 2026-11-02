<script lang="ts">
  import { House } from "@lucide/svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import FolderCounting from "#lib/library/FolderCounting.svelte";
  import { folderLocation } from "#lib/library/folder-location.ts";
  import type { FolderList } from "#lib/library/library-folders.svelte.ts";
  import type { RescanStatus } from "#lib/library/rescans.svelte.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ChangeHomeButton from "./ChangeHomeButton.svelte";
  import ChangeHomeRow from "./ChangeHomeRow.svelte";
  import HomeCard, { type HomeFact } from "./HomeCard.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepHeader from "./StepHeader.svelte";

  let {
    platform,
    folders,
    scan,
    isChanging,
    onBack,
    onNext,
    onChange,
  }: {
    platform: Platform;
    folders: FolderList;
    scan: RescanStatus;
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

  const LEADS = {
    android: m.first_launch_home_body_android,
    ios: m.first_launch_home_body_ios,
    linux: m.first_launch_home_body_desktop,
    macos: m.first_launch_home_body_desktop,
    windows: m.first_launch_home_body_desktop,
  } satisfies Record<Platform, () => string>;
  const NOTES = {
    android: m.first_launch_home_note_android,
    ios: undefined,
    linux: m.first_launch_home_note_desktop,
    macos: m.first_launch_home_note_desktop,
    windows: m.first_launch_home_note_desktop,
  } satisfies Record<Platform, (() => string) | undefined>;

  const isInFiles = $derived(platform === "ios");
  const note = $derived(NOTES[platform]);
  const isCounting = $derived(
    platform === "android" &&
      (scan.kind === "finding" || scan.kind === "reading"),
  );
</script>

<StepFrame step="home" {onBack}>
  <StepHeader>
    {#snippet badge()}
      <StepBadge icon={House} />
    {/snippet}
    {isInFiles ? m.first_launch_home_title_ios() : m.first_launch_home_title()}
    {#snippet lead()}
      {LEADS[platform]()}
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
      {#snippet counting()}
        {#if isCounting}
          <div class="text-native-row-subtitle/native-row-subtitle text-muted">
            <FolderCounting outcome={scan} inList />
          </div>
        {/if}
      {/snippet}
      {#snippet change(titleId, pathId)}
        {#if isPointer(platform)}
          <ChangeHomeButton {platform} isBusy={isChanging} onclick={onChange} />
        {:else if platform === "android"}
          <ChangeHomeRow
            {titleId}
            {pathId}
            isBusy={isChanging}
            onclick={onChange}
          />
        {/if}
      {/snippet}
    </HomeCard>
    {#if note !== undefined}
      <p
        class="px-xs text-footnote text-muted android:max-medium:text-native-first-launch-note/native-first-launch-note android:max-medium:font-native-first-launch-note android:max-medium:tracking-native-first-launch-note"
      >
        {note()}
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
