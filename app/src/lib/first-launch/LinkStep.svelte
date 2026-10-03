<script lang="ts">
  import { Link2 } from "@lucide/svelte";

  import type { AddFolder } from "$lib/library/add-folder";
  import type { LibraryFolders } from "$lib/library/library-folders.svelte";
  import LinkedFolders from "$lib/library/LinkedFolders.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import type { DeviceKind } from "./device";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepIcon from "./StepIcon.svelte";

  const HERO_ICON_SIZE = 30;

  let {
    device,
    folders,
    addFolder,
    onBack,
    onNext,
  }: {
    device: DeviceKind;
    folders: LibraryFolders;
    addFolder: AddFolder;
    onBack: () => void;
    onNext: () => void;
  } = $props();

  const HINT = {
    phone: undefined,
    desktop: m.first_launch_link_hint_desktop,
  } satisfies Record<DeviceKind, (() => string) | undefined>;
</script>

<StepFrame step="link" {onBack}>
  <div class="flex flex-col gap-lg">
    <StepIcon><Link2 size={HERO_ICON_SIZE} aria-hidden="true" /></StepIcon>
    <h1 tabindex="-1" class="text-headline font-bold">
      {m.first_launch_link_title()}
    </h1>
    <p class="text-muted">{m.first_launch_link_body()}</p>
    <div class="mbs-sm">
      <LinkedFolders {folders} {addFolder} hint={HINT[device]?.()} />
    </div>
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
    <StepButton kind="quiet" onclick={onNext}>
      <span class="medium:hidden">{m.first_launch_skip_phone()}</span>
      <span class="hidden medium:inline">{m.first_launch_skip_desktop()}</span>
    </StepButton>
  {/snippet}
</StepFrame>
