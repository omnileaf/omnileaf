import { m } from "#lib/paraglide/messages.js";

import type { ShareFailure, ShareWay } from "./report-sharing.svelte";

const FAILURES = {
  send: m.report_send_failed,
  github: m.about_browser_unavailable,
  copy: m.report_copy_failed,
  save: m.report_save_failed,
} satisfies Record<ShareWay, () => string>;

export function failureMessage({ way, code }: ShareFailure): string {
  return code === "reportsNotSent"
    ? m.reader_coming_soon({ feature: m.report_send() })
    : FAILURES[way]();
}
