import { CircleAlert } from "@lucide/svelte";

import type { IpcError } from "#lib/ipc/bindings.ts";
import type { Notice } from "#lib/notices/notices.ts";

export type SettingsOpened =
  | { readonly status: "ok"; readonly data: null }
  | { readonly status: "error"; readonly error: IpcError };

export interface Warner {
  show(notice: Notice): void;
}

export async function openSettingsOrWarn(
  open: () => Promise<SettingsOpened>,
  notices: Warner,
  failedTitle: string,
): Promise<void> {
  const opened = await open();
  if (opened.status === "error") {
    notices.show({ tone: "warning", icon: CircleAlert, title: failedTitle });
  }
}
