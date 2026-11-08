<script lang="ts">
  import { EyeOff, LayoutGrid, Tags } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    type AdultContent,
    type AdultTreatment,
    commands,
  } from "#lib/ipc/bindings.ts";
  import { NEW_ADULT_CONTENT } from "#lib/library/adult-content.ts";
  import { addFolderWithProgress } from "#lib/library/add-folder.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import LibraryFolderSettings from "#lib/library/LibraryFolderSettings.svelte";
  import { rescanFolderWithProgress } from "#lib/library/rescan-folder.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import RescanSchedule from "#lib/scheduled-rescans/RescanSchedule.svelte";
  import { getScheduledRescansSetting } from "#lib/scheduled-rescans/scheduled-rescans.svelte.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import {
    FLUSH_FOOTER,
    FLUSH_LIST,
  } from "#lib/settings/android-flush-look.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
  import SettingsEntries from "#lib/settings/SettingsEntries.svelte";
  import { StoredChoice } from "#lib/library/stored-choice.svelte.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
  const notices = getNotices();
  const scheduledRescans = getScheduledRescansSetting();
  const android = new AndroidPhone();

  const TREATMENT_LABELS = {
    show: m.adult_content_show,
    blur: m.adult_content_blur,
    hide: m.adult_content_hide,
  } satisfies Record<AdultTreatment, () => string>;

  const adultContent = new StoredChoice<AdultContent>(
    {
      read: () => commands.libraryAdultContent(),
      store: (chosen: AdultContent) => commands.setLibraryAdultContent(chosen),
      fallback: NEW_ADULT_CONTENT,
    },
    (error) => {
      reportError(error);
    },
  );

  let tagCount = $state<number | undefined>();

  onMount(() => {
    void adultContent.load();
    void commands.libraryTags().then((kept) => {
      tagCount = kept.status === "ok" ? kept.data.length : undefined;
    });
  });
</script>

<GroupedGround>
  <SectionHeading title={m.library_title()} />
  <LibraryFolderSettings
    listFolders={commands.libraryFolders}
    removeFolder={commands.removeLibraryFolder}
    countFolderBooks={commands.libraryFolderBookCount}
    addFolder={addFolderWithProgress}
    rescanFolder={rescanFolderWithProgress}
    removeFolderBooks={commands.removeBooksOfEmptiedFolder}
    homeCommands={{
      choose: commands.chooseHomeFolder,
      use: commands.useFoundLibrary,
      move: commands.moveHomeFolder,
    }}
    {notices}
    usesStandIns={screenshotMode.isOn}
    platform={data.appInfo.platform}
    onShowBooks={() => {
      void goto(resolve("/(app)"));
    }}
  />
  {#if android.isOn}
    <div class="mbs-xl">
      <div class={FLUSH_LIST}>
        <RescanSchedule
          schedule={scheduledRescans}
          platform={data.appInfo.platform}
        />
      </div>
      <p class={FLUSH_FOOTER}>{m.advanced_scheduled_rescans_help()}</p>
    </div>
  {/if}
  <div class="mbs-xl">
    <SettingsEntries
      entries={[
        {
          route: "/(app)/settings/library/tabs",
          icon: LayoutGrid,
          iconName: "layout-grid",
          label: m.library_tabs_title(),
          summary: m.library_tabs_summary(),
        },
        {
          route: "/(app)/settings/library/tags",
          icon: Tags,
          iconName: "tags",
          label: m.manage_tags_title(),
          ...(tagCount === undefined
            ? {}
            : { summary: m.manage_tags_count({ count: tagCount }) }),
        },
        {
          route: "/(app)/settings/library/adult-content",
          icon: EyeOff,
          iconName: "eye-off",
          label: m.adult_content_title(),
          ...(adultContent.reading.kind === "read"
            ? {
                summary:
                  TREATMENT_LABELS[adultContent.reading.value.treatment](),
              }
            : {}),
        },
      ]}
    />
  </div>
</GroupedGround>
