<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import { invalidate } from "$app/navigation";
  import {
    Alert,
    AlertActions,
    AlertButton,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import IncludedRows from "#lib/problem-report/IncludedRows.svelte";
  import { PROBLEM_REPORT } from "#lib/problem-report/problem-report.ts";
  import { localDayOf } from "#lib/history/local-date.ts";
  import { appleDeviceOf } from "#lib/library/folder-location.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import {
    ReportSharing,
    type Shared,
  } from "#lib/problem-report/report-sharing.svelte.ts";
  import SendToOmnileaf from "#lib/problem-report/SendToOmnileaf.svelte";
  import { sharedNotice } from "#lib/problem-report/shared-notice.ts";
  import WaysToSend from "#lib/problem-report/WaysToSend.svelte";
  import { yourReportsForDocument } from "#lib/problem-report/your-reports.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const notices = getNotices();
  const yourReports = yourReportsForDocument();
  const platform = $derived(data.appInfo.platform);

  async function showSaved(): Promise<void> {
    const shown = await commands.showSavedProblemReport();
    if (shown.status === "error") {
      notices.show({
        tone: "warning",
        icon: CircleAlert,
        title: m.report_folder_unavailable(),
      });
    }
  }

  async function copyCode(code: string): Promise<void> {
    const copied = await commands.copyProblemReportCode(code);
    if (copied.status === "error") {
      notices.show({
        tone: "warning",
        icon: CircleAlert,
        title: m.report_code_copy_failed(),
      });
    }
  }

  const sharing = new ReportSharing(
    commands,
    () => localDayOf(new Date()),
    (shared: Shared) => {
      if (data.report.status !== "ok") {
        return;
      }
      const { code } = data.report.data;
      yourReports.keep({ code, madeAtMs: Date.now() });
      const notice = sharedNotice(shared, {
        code,
        platform,
        appleDevice: appleDeviceOf(navigator.userAgent),
        showFolder: {
          label: showFileLabel(platform),
          run: () => {
            void showSaved();
          },
        },
        copyCode: {
          label: m.report_copy_code(),
          run: () => {
            void copyCode(code);
          },
        },
      });
      if (notice !== undefined) {
        notices.show(notice);
      }
    },
  );
</script>

<SectionHeading
  title={m.about_report_problem()}
  parent={{ route: "/(app)/settings/about", title: m.about_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm">
  <p class="text-detail text-muted">{m.report_intro()}</p>
  {#if data.report.status === "ok"}
    <IncludedRows report={data.report.data} />
    <SendToOmnileaf {sharing} />
    <WaysToSend {sharing} canSave={platform !== "android"} />
  {:else}
    <Alert tone="warning" icon={CircleAlert} role="alert">
      <AlertTitle>{m.report_failed()}</AlertTitle>
      <AlertActions>
        <AlertButton
          emphasis="quiet"
          onclick={() => {
            void invalidate(PROBLEM_REPORT);
          }}
        >
          {m.report_try_again()}
        </AlertButton>
      </AlertActions>
    </Alert>
  {/if}
</div>
