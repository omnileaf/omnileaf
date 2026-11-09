import type { Api } from "#lib/api.ts";
import type { MoveProps } from "#lib/move-props.ts";
import { MoveControl } from "#lib/move-control.svelte.ts";
import { reflectMove, refreshReport } from "#lib/refresh-report.ts";
import { ReportStore } from "#lib/report-store.svelte.ts";
import type { ReportsStore } from "#lib/reports-store.svelte.ts";
import { isReportCode } from "#lib/wire.ts";

export interface ScreenDependencies {
  readonly api: Pick<Api, "report" | "move">;
  readonly reports: Pick<ReportsStore, "apply">;
  readonly code: string;
  readonly csrf: string | undefined;
  readonly focusHeading: () => void;
  readonly settle: () => Promise<void>;
}

function propsOf(control: MoveControl, reloadReport: () => void): MoveProps {
  return {
    get state() {
      return control.state;
    },
    get draft() {
      return control.issueDraft;
    },
    onDraftChange: (text) => {
      control.changeDraft(text);
    },
    onChoose: (target) => {
      void control.choose(target);
    },
    onConfirm: () => {
      void control.confirm();
    },
    onCancel: () => {
      control.cancel();
    },
    onRetry: () => {
      void control.retry();
    },
    onReload: reloadReport,
  };
}

export class ReportScreen {
  readonly report: ReportStore;
  readonly move: MoveProps | undefined;

  constructor({
    api,
    reports,
    code,
    csrf,
    focusHeading,
    settle,
  }: ScreenDependencies) {
    const report = new ReportStore(api, code);
    this.report = report;
    if (csrf === undefined || !isReportCode(code)) {
      this.move = undefined;
      return;
    }
    const control = new MoveControl({
      api,
      code,
      csrf,
      refresh: () => refreshReport(report, reports),
      moved: (status) => reflectMove(report, reports, status),
    });
    async function reloadAndFocus(): Promise<void> {
      await control.reloadReport();
      if (report.state.kind !== "ready") {
        await settle();
        focusHeading();
      }
    }
    this.move = propsOf(control, () => {
      void reloadAndFocus();
    });
  }

  load(): Promise<void> {
    return this.report.reload();
  }
}
