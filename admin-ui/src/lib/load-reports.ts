import type { ReportsStore } from "#lib/reports-store.svelte.ts";

export function loadWhenSignedIn(
  session: { readonly ok: boolean },
  reports: Pick<ReportsStore, "ensureLoaded">,
): void {
  if (session.ok) {
    void reports.ensureLoaded();
  }
}
