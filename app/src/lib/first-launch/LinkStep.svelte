<script lang="ts">
  import { Link2 } from "@lucide/svelte";

  import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
  import type { AddFolder } from "#lib/library/add-folder.ts";
  import { FolderBookCounts } from "#lib/library/folder-book-counts.svelte.ts";
  import type { LibraryFolders } from "#lib/library/library-folders.svelte.ts";
  import LinkedFolders from "#lib/library/LinkedFolders.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import type { Notices } from "#lib/notices/notices.ts";
  import WidthWording from "#lib/page/WidthWording.svelte";
  import { atEveryWidth, type WordingByWidth } from "#lib/page/wording.ts";
  import { m } from "#lib/paraglide/messages.js";

  import PickFolderSheet from "./PickFolderSheet.svelte";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepBadge from "./StepBadge.svelte";
  import StepHeader from "./StepHeader.svelte";

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
  const counts = new FolderBookCounts((folder) => folders.countBooks(folder));
  const linked = $derived(
    folders.list.kind === "loaded" ? folders.list.linked : [],
  );

  $effect(() => {
    void counts.load(linked);
  });

  let isExplainingPicker = $state(false);
  let hasExplainedPicker = false;
  let answerPickerSheet: ((goesOn: boolean) => void) | undefined;

  function explainPickerFirst(): Promise<boolean> {
    if (platform !== "android" || hasExplainedPicker) {
      return Promise.resolve(true);
    }
    isExplainingPicker = true;
    return new Promise((resolve) => {
      answerPickerSheet = resolve;
    });
  }

  function closePickerSheet(goesOn: boolean): void {
    isExplainingPicker = false;
    hasExplainedPicker ||= goesOn;
    answerPickerSheet?.(goesOn);
    answerPickerSheet = undefined;
  }

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
    <StepHeader>
      {#snippet badge()}
        <StepBadge icon={Link2} />
      {/snippet}
      {m.first_launch_link_title()}
      {#snippet lead()}
        {m.first_launch_link_body()}
      {/snippet}
    </StepHeader>
    <LinkedFolders
      {platform}
      {folders}
      {addFolder}
      mayPick={explainPickerFirst}
      {notices}
      usesStandIns={screenshotMode.isOn}
      addPlacement="below-list"
    >
      {#snippet rowDetail(folder: LibraryFolder)}
        {@const books = counts.of(folder)}
        {#if books !== undefined}
          {m.first_launch_folder_books({ count: books })}
        {/if}
      {/snippet}
      {#snippet hint()}
        <WidthWording wording={HINT[platform]} />
      {/snippet}
    </LinkedFolders>
  </div>
  <PickFolderSheet
    isOpen={isExplainingPicker}
    onContinue={() => {
      closePickerSheet(true);
    }}
    onNotNow={() => {
      closePickerSheet(false);
    }}
  />
  {#snippet actions()}
    {#if linked.length > 0}
      <StepButton kind="primary" onclick={onNext}>
        {m.first_launch_continue()}
      </StepButton>
    {/if}
    <StepButton kind="quiet" onclick={onNext}>
      <WidthWording wording={SKIP} />
    </StepButton>
  {/snippet}
</StepFrame>
