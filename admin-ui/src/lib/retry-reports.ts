import { refreshAndFocus } from "#lib/refresh-and-focus.ts";
import type { ReportsStore } from "#lib/reports-store.svelte.ts";

export function retryReports(
  reports: Pick<ReportsStore, "reload">,
  focusHeading: () => void,
): Promise<void> {
  return refreshAndFocus(() => reports.reload(), focusHeading);
}
