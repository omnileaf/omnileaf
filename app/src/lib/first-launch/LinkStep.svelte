<script lang="ts">
  import { Link2 } from "@lucide/svelte";

  import type { Platform } from "$lib/ipc/bindings";
  import type { AddFolder } from "$lib/library/add-folder";
  import type { LibraryFolders } from "$lib/library/library-folders.svelte";
  import LinkedFolders from "$lib/library/LinkedFolders.svelte";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";
  import type { Notices } from "$lib/notices/notices.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepHeader from "./StepHeader.svelte";
  import WidthWording from "./WidthWording.svelte";
  import { atEveryWidth, type WordingByWidth } from "./wording";

  let {
    platform,
    folders,
    addFolder,
    notices,
    onBack,
    onNext,
  }: {
    platform: Platform;
    folders: LibraryFolders;
    addFolder: AddFolder;
    notices: Notices;
    onBack: () => void;
    onNext: () => void;
  } = $props();

  const screenshotMode = getScreenshotMode();

  const HINT = {
    android: {
      onPhones: m.first_launch_link_hint_android_phone,
      fromMedium: m.first_launch_link_hint_android_tablet,
    },
    ios: atEveryWidth(m.first_launch_link_hint_ios),
    macos: atEveryWidth(m.first_launch_link_hint_desktop),
    windows: atEveryWidth(m.first_launch_link_hint_desktop),
    linux: atEveryWidth(m.first_launch_link_hint_desktop),
  } satisfies Record<Platform, WordingByWidth>;

  const SKIP = {
    onPhones: m.first_launch_skip_phone,
    fromMedium: m.first_launch_skip_desktop,
  } satisfies WordingByWidth;
</script>

<StepFrame step="link" {onBack}>
  <div class="flex flex-col gap-lg">
    <StepHeader scale="headline">
      {#snippet badge()}
        <StepBadge icon={Link2} />
      {/snippet}
      {m.first_launch_link_title()}
    </StepHeader>
    <p class="text-muted">{m.first_launch_link_body()}</p>
    <div class="mbs-sm">
      <LinkedFolders
        {folders}
        {addFolder}
        {notices}
        usesStandIns={screenshotMode.isOn}
      >
        {#snippet hint()}
          <WidthWording wording={HINT[platform]} />
        {/snippet}
      </LinkedFolders>
    </div>
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_continue()}
    </StepButton>
    <StepButton kind="quiet" onclick={onNext}>
      <WidthWording wording={SKIP} />
    </StepButton>
  {/snippet}
</StepFrame>
