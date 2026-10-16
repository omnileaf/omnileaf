<script lang="ts">
  import { getTimeFormatSetting } from "#lib/general/time-format.svelte.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone, isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { yourReportsForDocument } from "#lib/problem-report/your-reports.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const yourReports = yourReportsForDocument();
  const timeFormat = getTimeFormatSetting();
  const width = new WindowWidth();

  const intro = $derived.by(() => {
    const platform = data.appInfo.platform;
    if (isPointer(platform)) {
      return m.your_reports_intro_computer();
    }
    return isPhone(platform, width.current)
      ? m.your_reports_intro_phone()
      : m.your_reports_intro_tablet();
  });
  const madeAt = $derived(
    new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "long",
      timeStyle: "short",
      ...(timeFormat.hourCycle === undefined
        ? {}
        : { hourCycle: timeFormat.hourCycle }),
    }),
  );
</script>

<SectionHeading
  title={m.your_reports_title()}
  parent={{ route: "/(app)/settings/about", title: m.about_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm">
  <p class="text-detail text-muted">{intro}</p>
  {#if yourReports.reports.length === 0}
    <p class="text-detail">{m.your_reports_none()}</p>
  {:else}
    <ul
      aria-label={m.your_reports_title()}
      class="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card android:rounded-android-md android:border-transparent android:bg-android-container-low"
    >
      {#each yourReports.reports as report (report.code)}
        <li class="flex flex-col gap-2xs px-lg py-md min-block-touch-target">
          <span class="font-medium expanded:font-semibold"
            >{madeAt.format(report.madeAtMs)}</span
          >
          <span class="text-detail text-muted"
            >{m.your_reports_code({ code: report.code })}</span
          >
        </li>
      {/each}
    </ul>
  {/if}
</div>
