<script lang="ts">
  import { House } from "@lucide/svelte";

  import HomeFolder from "$lib/library/HomeFolder.svelte";
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
    <HomeFolder {folders} class="mbs-sm">
      {#if folders.kind === "failed"}
        <p class="mbs-sm px-xs">{m.library_folders_failed()}</p>
      {/if}
    </HomeFolder>
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
  {/snippet}
</StepFrame>
