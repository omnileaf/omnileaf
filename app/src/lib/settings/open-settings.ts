import { CircleAlert } from "@lucide/svelte";

import type { commands } from "#lib/ipc/bindings.ts";
import type { Notices } from "#lib/notices/notices.ts";

export async function openSettingsOrWarn(
  open: typeof commands.openSystemSettings,
  notices: Pick<Notices, "show">,
  failedTitle: string,
): Promise<void> {
  const opened = await open();
  if (opened.status === "error") {
    reportError(opened.error);
    notices.show({ tone: "warning", icon: CircleAlert, title: failedTitle });
  }
}
