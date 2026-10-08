<script lang="ts">
  import { House } from "@lucide/svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import FolderRow from "#lib/library/FolderRow.svelte";
  import HomeFolder from "#lib/library/HomeFolder.svelte";
  import type { FolderList } from "#lib/library/library-folders.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderLocation } from "./folder-location";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepHeader from "./StepHeader.svelte";
  import WidthWording from "./WidthWording.svelte";

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

  const isInFiles = $derived(platform === "ios");
</script>

<StepFrame step="home" {onBack}>
  <div class="flex flex-col gap-lg">
    <StepHeader scale="headline">
      {#snippet badge()}
        <StepBadge icon={House} />
      {/snippet}
      {isInFiles
        ? m.first_launch_home_title_ios()
        : m.first_launch_home_title()}
    </StepHeader>
    <p class="text-step-body wrap-break-word text-muted">
      {isInFiles ? m.first_launch_home_body_ios() : m.first_launch_home_body()}
    </p>
    {#if isInFiles}
      {#if folders.kind === "loaded" && folders.home !== undefined}
        {@const home = folders.home}
        <div class="rounded-card border border-border bg-card">
          <FolderRow folder={home}>
            {#snippet location()}
              <WidthWording wording={folderLocation(home, platform)} />
            {/snippet}
          </FolderRow>
        </div>
      {/if}
    {:else}
      <HomeFolder {folders} class="mbs-sm" />
    {/if}
    {#if folders.kind === "failed"}
      <p class="px-xs">{m.library_folders_failed()}</p>
    {/if}
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
  {/snippet}
</StepFrame>
