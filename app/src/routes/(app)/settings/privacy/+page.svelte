<script lang="ts">
  import {
    CRASH_REPORT_CHOICES,
    type CrashReportChoice,
    getCrashReportSetting,
  } from "#lib/crash-report/choice.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SegmentedChoice from "#lib/settings/SegmentedChoice.svelte";
  import SettingsLinks from "#lib/settings/SettingsLinks.svelte";

  const CHOICE_LABELS = {
    ask: m.crash_reports_ask,
    always: m.crash_reports_always,
    never: m.crash_reports_never,
  } satisfies Record<CrashReportChoice, () => string>;

  const crashReports = getCrashReportSetting();
  const screenshotMode = getScreenshotMode();

  const headingId = $props.id();
  const hintId = `${headingId}-hint`;
</script>

<SectionHeading title={m.privacy_title()} />
<section
  aria-labelledby={headingId}
  class="mbs-pane-gap flex flex-col gap-sm touch:max-medium:rounded-list touch:max-medium:border touch:max-medium:border-border touch:max-medium:bg-card touch:max-medium:p-list-row"
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
  <SegmentedChoice
    name="crash-reports"
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
<SettingsLinks
  links={[
    {
      route: "/(app)/settings/privacy/screenshot-mode",
      label: m.screenshot_mode_title(),
      value: screenshotMode.isOn ? m.switch_on() : m.switch_off(),
    },
  ]}
/>
