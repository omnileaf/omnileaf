<script lang="ts">
  import { Library } from "@lucide/svelte";

  import type { FoundLibrary, Platform } from "#lib/ipc/bindings.ts";
  import { folderLocation } from "#lib/library/folder-location.ts";
  import type { FolderList } from "#lib/library/library-folders.svelte.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import ChangeHomeButton from "./ChangeHomeButton.svelte";
  import ChangeHomeRow from "./ChangeHomeRow.svelte";
  import ComingSoonStepButton from "./ComingSoonStepButton.svelte";
  import HomeCard, { type HomeFact } from "./HomeCard.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepHeader from "./StepHeader.svelte";

  let {
    platform,
    folders,
    found,
    chosenLocation,
    isBusy,
    onBack,
    onStartNew,
    onUse,
    onChange,
  }: {
    platform: Platform;
    folders: FolderList;
    found: FoundLibrary;
    chosenLocation: string | undefined;
    isBusy: boolean;
    onBack: () => void;
    onStartNew: () => void;
    onUse: () => void;
    onChange: () => void;
  } = $props();

  const canChange = $derived(isPointer(platform));
  const location = $derived.by(() => {
    if (chosenLocation !== undefined) {
      return chosenLocation;
    }
    return folders.kind === "loaded" && folders.home !== undefined
      ? folderLocation(folders.home, platform)
      : undefined;
  });

  const facts: readonly HomeFact[] = $derived.by(() => {
    const numbers = new Intl.NumberFormat(getLocale());
    const dates = new Intl.DateTimeFormat(getLocale(), { dateStyle: "long" });
    const lastBackup =
      found.lastBackupAtMs === null
        ? []
        : [
            {
              term: m.first_launch_found_last_backup(),
              detail: dates.format(found.lastBackupAtMs),
            },
          ];
    return [
      {
        term: m.first_launch_found_series(),
        detail: numbers.format(found.series),
      },
      {
        term: m.first_launch_found_books(),
        detail: numbers.format(found.books),
      },
      ...lastBackup,
    ];
  });
</script>

<StepFrame step="home" {onBack}>
  <StepHeader>
    {#snippet badge()}
      <StepBadge icon={Library} />
    {/snippet}
    {m.first_launch_found_title()}
    {#snippet lead()}
      {m.first_launch_found_body()}
    {/snippet}
  </StepHeader>
  {#if location !== undefined}
    <HomeCard title={m.library_settings_home_folder()} {location} {facts}>
      {#snippet change(titleId, pathId)}
        {#if canChange}
          <ChangeHomeButton {platform} {isBusy} onclick={onChange} />
        {:else if platform !== "ios"}
          <ChangeHomeRow {titleId} {pathId} />
        {/if}
      {/snippet}
    </HomeCard>
  {/if}
  {#if location === undefined && folders.kind === "failed"}
    <p class="px-xs">{m.library_folders_failed()}</p>
  {/if}
  {#snippet actions()}
    {#if canChange}
      <StepButton kind="primary" {isBusy} onclick={onUse}>
        {m.first_launch_use_library()}
      </StepButton>
    {:else}
      <ComingSoonStepButton
        kind="primary"
        label={m.first_launch_use_library()}
      />
    {/if}
    <StepButton kind="quiet" onclick={onStartNew}>
      {m.first_launch_start_new_library()}
    </StepButton>
  {/snippet}
</StepFrame>
