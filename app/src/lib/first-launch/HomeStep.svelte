<script lang="ts">
  import { House } from "@lucide/svelte";

  import FolderRow from "$lib/library/FolderRow.svelte";
  import type { FolderList } from "$lib/library/library-folders.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepIcon from "./StepIcon.svelte";

  const HERO_ICON_SIZE = 30;

  let {
    folders,
    onBack,
    onNext,
  }: { folders: FolderList; onBack: () => void; onNext: () => void } = $props();
</script>

<StepFrame step="home" {onBack}>
  <div class="flex flex-col gap-lg">
    <StepIcon><House size={HERO_ICON_SIZE} aria-hidden="true" /></StepIcon>
    <h1 tabindex="-1" class="text-headline font-bold">
      {m.first_launch_home_title()}
    </h1>
    <p class="text-muted">{m.first_launch_home_body()}</p>
    <section aria-labelledby="first-launch-home-folder" class="mbs-sm">
      <h2
        id="first-launch-home-folder"
        class="px-xs text-caption font-semibold text-muted"
      >
        {m.library_settings_home_folder()}
      </h2>
      {#if folders.kind === "loaded" && folders.home !== undefined}
        <div class="mbs-sm rounded-card border border-border bg-card">
          <FolderRow folder={folders.home} />
        </div>
      {:else if folders.kind === "failed"}
        <p class="mbs-sm px-xs">{m.library_folders_failed()}</p>
      {/if}
    </section>
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
  {/snippet}
</StepFrame>
