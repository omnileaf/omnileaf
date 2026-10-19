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
    onBack,
    onStartNew,
  }: {
    platform: Platform;
    folders: FolderList;
    found: FoundLibrary;
    onBack: () => void;
    onStartNew: () => void;
  } = $props();

  const facts: readonly HomeFact[] = $derived.by(() => {
    const numbers = new Intl.NumberFormat(getLocale());
    const dates = new Intl.DateTimeFormat(getLocale(), { dateStyle: "long" });
    return [
      {
        term: m.first_launch_found_series(),
        detail: numbers.format(found.series),
      },
      {
        term: m.first_launch_found_books(),
        detail: numbers.format(found.books),
      },
      {
        term: m.first_launch_found_last_backup(),
        detail: dates.format(found.lastBackupAtMs),
      },
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
  {#if folders.kind === "loaded" && folders.home !== undefined}
    <HomeCard
      title={m.library_settings_home_folder()}
      location={folderLocation(folders.home, platform)}
      {facts}
    >
      {#snippet change(titleId, pathId)}
        {#if isPointer(platform)}
          <ChangeHomeButton />
        {:else if platform !== "ios"}
          <ChangeHomeRow {titleId} {pathId} />
        {/if}
      {/snippet}
    </HomeCard>
  {/if}
  {#if folders.kind === "failed"}
    <p class="px-xs">{m.library_folders_failed()}</p>
  {/if}
  {#snippet actions()}
    <ComingSoonStepButton kind="primary" label={m.first_launch_use_library()} />
    <StepButton kind="quiet" onclick={onStartNew}>
      {m.first_launch_start_new_library()}
    </StepButton>
  {/snippet}
</StepFrame>
