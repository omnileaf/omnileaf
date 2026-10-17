<script lang="ts">
  import { ScanEye, ShieldCheck } from "@lucide/svelte";

  import {
    CRASH_REPORT_CHOICES,
    type CrashReportChoice,
    getCrashReportSetting,
  } from "#lib/crash-report/choice.svelte.ts";
  import { getTimeFormatSetting } from "#lib/general/time-format.svelte.ts";
  import WidthWording from "#lib/page/WidthWording.svelte";
  import { atEveryWidth, type WordingByWidth } from "#lib/page/wording.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { permissionsSummary } from "#lib/permissions/permissions.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { screenshotModeSummary } from "#lib/screenshot-mode/status.ts";
  import SettingsEntries from "#lib/settings/SettingsEntries.svelte";

  import type { PageProps } from "./$types";

  const CHOICE_LABELS = {
    ask: m.crash_reports_ask,
    always: m.crash_reports_always,
    never: m.crash_reports_never,
  } satisfies Record<CrashReportChoice, () => string>;

  const NOTHING_LEAVES_ON_TOUCH: WordingByWidth = {
    onPhones: m.privacy_nothing_leaves_phone,
    fromMedium: m.privacy_nothing_leaves_tablet,
  };
  const NOTHING_LEAVES_ON_DESKTOP = atEveryWidth(
    m.privacy_nothing_leaves_computer,
  );
  const NOTE_ICON_SIZE = 14;

  let { data }: PageProps = $props();

  const crashReports = getCrashReportSetting();
  const screenshotMode = getScreenshotMode();
  const timeFormat = getTimeFormatSetting();
  const sendsReportsOnItsOwn = $derived(crashReports.choice === "always");

  const headingId = $props.id();
  const hintId = `${headingId}-hint`;
</script>

<SectionHeading title={m.privacy_title()} />
<div class="mbs-pane-gap flex flex-col gap-lg">
  <SettingsEntries
    entries={[
      {
        route: "/(app)/settings/privacy/screenshot-mode",
        icon: ScanEye,
        label: m.screenshot_mode_title(),
        summary: screenshotModeSummary(
          screenshotMode.activity,
          timeFormat.hourCycle,
        ),
      },
      {
        route: "/(app)/settings/privacy/permissions",
        icon: ShieldCheck,
        label: m.permissions_title(),
        summary: permissionsSummary(data.linkedFolders),
      },
    ]}
  />
  {#if !sendsReportsOnItsOwn}
    <p class="flex items-start gap-xs px-2xs text-footnote text-muted">
      <ShieldCheck
        size={NOTE_ICON_SIZE}
        aria-hidden="true"
        class="mbs-2xs shrink-0"
      />
      <span>
        <WidthWording
          wording={isPointer(data.appInfo.platform)
            ? NOTHING_LEAVES_ON_DESKTOP
            : NOTHING_LEAVES_ON_TOUCH}
        />
      </span>
    </p>
  {/if}
</div>
<section
  aria-labelledby={headingId}
  class="mbs-xl flex flex-col gap-sm touch:max-medium:rounded-list touch:max-medium:border touch:max-medium:border-border touch:max-medium:bg-card touch:max-medium:p-list-row"
>
  <h2
    id={headingId}
    class="font-semibold touch:medium:text-label touch:medium:text-muted desktop:text-footnote desktop:text-muted"
  >
    {m.privacy_crash_reports()}
  </h2>
  <p
    id={hintId}
    class="text-footnote text-muted touch:medium:order-last desktop:order-last"
  >
    {m.privacy_crash_reports_hint()}
  </p>
  <SegmentedControl
    options={CRASH_REPORT_CHOICES}
    labels={CHOICE_LABELS}
    chosen={crashReports.choice}
    labelledBy={headingId}
    describedBy={hintId}
    onChoose={(choice: CrashReportChoice) => {
      crashReports.choose(choice);
    }}
  />
</section>
