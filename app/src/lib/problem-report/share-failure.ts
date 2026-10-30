import type { IpcErrorCode } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import type { ShareFailure, ShareWay } from "./report-sharing.svelte";

const FAILURES = {
  send: m.report_send_failed,
  github: m.about_browser_unavailable,
  copy: m.report_copy_failed,
  save: m.report_save_failed,
} satisfies Record<ShareWay, () => string>;

const SEND_FAILURES: Partial<Record<IpcErrorCode, () => string>> = {
  relayUnreachable: m.report_send_unreachable,
  relayRateLimited: m.report_send_rate_limited,
  relayBusy: m.report_send_busy,
  replyAddressInvalid: m.report_reply_email_invalid,
};

export function failureMessage({ way, code }: ShareFailure): string {
  const message = way === "send" ? SEND_FAILURES[code] : undefined;
  return (message ?? FAILURES[way])();
}
