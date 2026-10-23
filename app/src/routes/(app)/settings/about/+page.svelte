<script lang="ts">
  import appIcon from "#branding/icon.svg";
  import AboutFailures from "#lib/about/AboutFailures.svelte";
  import CopyVersionButton from "#lib/about/CopyVersionButton.svelte";
  import AboutPageRow from "#lib/about/AboutPageRow.svelte";
  import { LinkOpening } from "#lib/about/link-opening.svelte.ts";
  import ProjectLinkRows from "#lib/about/ProjectLinkRows.svelte";
  import RowText from "#lib/about/RowText.svelte";
  import { Bug, FileText, Info, Send } from "@lucide/svelte";

  import { Item } from "#lib/components/ui/item/index.ts";
  import { DetailsCopying } from "#lib/copying/details-copying.svelte.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { isPhone, isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { yourReportsForDocument } from "#lib/problem-report/your-reports.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const copying = new DetailsCopying(commands.copyVersionDetails);
  const opening = new LinkOpening(commands.openProjectLink);

  const yourReports = yourReportsForDocument();
  const width = new WindowWidth();
  const look = $derived(
    isPhone(data.appInfo.platform, width.current) ? "phone" : "pane",
  );
  const reportHint = $derived(
    isPointer(data.appInfo.platform)
      ? m.about_report_problem_hint_computer()
      : look === "phone"
        ? m.about_report_problem_hint_phone()
        : m.about_report_problem_hint_tablet(),
  );
</script>

<SectionHeading title={m.about_title()} />
<div class="mbs-pane-gap flex flex-col gap-xl two-pane:max-inline-section">
  <div class="flex flex-col items-center gap-xs text-center">
    <img
      src={appIcon}
      alt=""
      class={look === "phone"
        ? "block-app-icon inline-app-icon"
        : "block-pane-app-icon inline-pane-app-icon"}
    />
    <h2
      class={[
        "mbs-xs font-bold",
        look === "phone" ? "text-app-name" : "text-group-title",
      ]}
    >
      {m.app_name()}
    </h2>
    <p class="text-footnote text-muted select-text">
      {m.app_version({ version: data.appInfo.version })}
    </p>
  </div>
  <div>
    <ul
      class={[
        "divide-y divide-border overflow-hidden rounded-list border border-border bg-card",
        GROUP_PLATE,
      ]}
    >
      <AboutPageRow
        route="/(app)/settings/about/report"
        icon={Bug}
        label={m.about_report_problem()}
        hint={reportHint}
        {look}
      />
      {#if yourReports.reports.length > 0}
        <AboutPageRow
          route="/(app)/settings/about/reports"
          icon={Send}
          label={m.your_reports_title()}
          hint={m.your_reports_sent({ count: yourReports.reports.length })}
          {look}
        />
      {/if}
      <ProjectLinkRows {opening} sourceCode={data.appInfo.sourceCode} {look} />
      <AboutPageRow
        route="/(app)/settings/about/licences"
        icon={FileText}
        label={m.about_licences()}
        hint={m.about_licences_hint()}
        {look}
      />
      <Item look="about-version">
        {#snippet child({ props })}
          <li {...props}>
            <RowText
              icon={Info}
              label={m.about_version_details()}
              hint={data.appInfo.version}
              {look}
            />
            <CopyVersionButton {copying} {look} />
          </li>
        {/snippet}
      </Item>
    </ul>
    <AboutFailures {copying} {opening} />
  </div>
  <p class="px-md text-center text-footnote text-muted">
    {m.about_licence()}
  </p>
</div>
