<script lang="ts">
  import { House } from "@lucide/svelte";

  import HomeFolder from "$lib/library/HomeFolder.svelte";
  import type { FolderList } from "$lib/library/library-folders.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepHeader from "./StepHeader.svelte";

  let {
    folders,
    onBack,
    onNext,
  }: { folders: FolderList; onBack: () => void; onNext: () => void } = $props();
</script>

<StepFrame step="home" {onBack}>
  <div class="flex flex-col gap-lg">
    <StepHeader scale="headline">
      {#snippet badge()}
        <StepBadge icon={House} />
      {/snippet}
      {m.first_launch_home_title()}
    </StepHeader>
    <p class="text-step-body text-muted">{m.first_launch_home_body()}</p>
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
