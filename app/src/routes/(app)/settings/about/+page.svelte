<script lang="ts">
  import appIcon from "#branding/icon.svg";
  import { CurrentAboutLook } from "#lib/about/about-look.svelte.ts";
  import AboutFailures from "#lib/about/AboutFailures.svelte";
  import CopyVersionButton from "#lib/about/CopyVersionButton.svelte";
  import AboutPageRow from "#lib/about/AboutPageRow.svelte";
  import { LinkOpening } from "#lib/about/link-opening.svelte.ts";
  import ProjectLinkRows from "#lib/about/ProjectLinkRows.svelte";
  import RowText from "#lib/about/RowText.svelte";
  import UpdateCheckRow from "#lib/about/UpdateCheckRow.svelte";
  import UpdateBanner from "#lib/updates/UpdateBanner.svelte";
  import UpdateNoticeRow from "#lib/updates/UpdateNoticeRow.svelte";
  import { Bug, FileText, Info, Send, Sparkles } from "@lucide/svelte";

  import { Item } from "#lib/components/ui/item/index.ts";
  import { DetailsCopying } from "#lib/copying/details-copying.svelte.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import {
    offersUpdateCheck,
    updateCheckForApp,
  } from "#lib/updates/update-check.svelte.ts";
  import { yourReportsForDocument } from "#lib/problem-report/your-reports.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";
  import { whatsNewRowHint } from "#lib/whats-new/about-row.ts";

  import { type AboutLook, ROW_LISTS } from "#lib/about/look.ts";
  import {
    buildDateText,
    builtOn,
    deviceNameOf,
    versionDetails,
  } from "#lib/about/version-line.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const copying = new DetailsCopying(commands.copyVersionDetails);
  const opening = new LinkOpening(commands.openProjectLink);

  const yourReports = yourReportsForDocument();
  const updateCheck = updateCheckForApp();
  const built = builtOn(import.meta.env.VITE_BUILD_DATE);
  const versionLine = $derived(
    built === undefined
      ? m.app_version({ version: data.appInfo.version })
      : m.app_version_built({
          version: data.appInfo.version,
          date: buildDateText(built, getLocale()),
        }),
  );
  const versionHint = $derived(
    versionDetails(
      data.appInfo.version,
      built,
      deviceNameOf(navigator.userAgent),
      getLocale(),
    ),
  );
  const aboutLook = new CurrentAboutLook();
  const look: AboutLook = $derived(aboutLook.current);
  const whatsNewHint = $derived(
    whatsNewRowHint(data.appInfo.platform, data.whatsNew),
  );
  const reportHint = $derived(
    isPointer(data.appInfo.platform)
      ? m.about_report_problem_hint_computer()
      : look !== "pane"
        ? m.about_report_problem_hint_phone()
        : m.about_report_problem_hint_tablet(),
  );
</script>

<SectionHeading title={m.about_title()} />
<div
  class="mbs-pane-gap flex flex-col gap-xl android:max-medium:mbs-none two-pane:max-inline-section"
>
  {#if offersUpdateCheck(data.appInfo) && updateCheck.shownRelease !== undefined}
    <UpdateBanner checking={updateCheck} release={updateCheck.shownRelease} />
  {/if}
  <div class="flex flex-col items-center gap-xs text-center min-inline-none">
    <img
      src={appIcon}
      alt=""
      class={look === "pane"
        ? "block-pane-app-icon inline-pane-app-icon"
        : [
            "block-app-icon inline-app-icon",
            look === "android" && "rounded-full",
          ]}
    />
    <h2
      class={[
        "mbs-xs wrap-anywhere",
        look === "android"
          ? "text-app-name font-regular"
          : [
              "font-bold",
              look === "phone" ? "text-app-name" : "text-group-title",
            ],
      ]}
    >
      {m.app_name()}
    </h2>
    <p class="text-footnote text-muted select-text">
      {versionLine}
    </p>
  </div>
  <div>
    <ul class={ROW_LISTS[look]}>
      {#if offersUpdateCheck(data.appInfo)}
        <UpdateCheckRow checking={updateCheck} {look} />
        <li>
          <SettingSwitch
            label={m.about_check_automatically()}
            description={updateCheck.isAutomatic
              ? m.about_check_automatically_on()
              : m.about_check_automatically_off()}
            isOn={updateCheck.isAutomatic}
            onToggle={() => {
              void updateCheck.setAutomatic(!updateCheck.isAutomatic);
            }}
          />
        </li>
        <UpdateNoticeRow isAutomatic={updateCheck.isAutomatic} />
      {/if}
      {#if whatsNewHint !== undefined}
        <AboutPageRow
          route="/(app)/settings/about/whats-new"
          icon={Sparkles}
          iconName="sparkles"
          label={m.whats_new_title()}
          hint={whatsNewHint}
          {look}
        />
      {/if}
      <AboutPageRow
        route="/(app)/settings/about/report"
        icon={Bug}
        iconName="bug"
        label={m.about_report_problem()}
        hint={reportHint}
        {look}
      />
      {#if yourReports.reports.length > 0}
        <AboutPageRow
          route="/(app)/settings/about/reports"
          icon={Send}
          iconName="send"
          label={m.your_reports_title()}
          hint={m.your_reports_sent({ count: yourReports.reports.length })}
          {look}
        />
      {/if}
      <ProjectLinkRows {opening} sourceCode={data.appInfo.sourceCode} {look} />
      <AboutPageRow
        route="/(app)/settings/about/licences"
        icon={FileText}
        iconName="file-text"
        label={m.about_licences()}
        hint={m.about_licences_hint()}
        {look}
      />
      <Item look={look === "android" ? "row" : "about-version"}>
        {#snippet child({ props })}
          <li {...props}>
            <RowText
              icon={Info}
              iconName="info"
              label={m.about_version_details()}
              hint={versionHint}
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
