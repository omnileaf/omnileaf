import { CircleCheck } from "@lucide/svelte";

import type { Platform, SavedPlace } from "#lib/ipc/bindings.ts";
import type { Notice, NoticeAction } from "#lib/notices/notices.ts";
import { isPointer } from "#lib/page/platform.ts";
import { m } from "#lib/paraglide/messages.js";

import type { Shared } from "./report-sharing.svelte";

export interface NoticeContext {
  readonly code: string;
  readonly platform: Platform;
  readonly isPhone: boolean;
  readonly showFolder: NoticeAction;
}

function placeOf(
  place: SavedPlace,
  file: string,
  { isPhone }: NoticeContext,
): string {
  switch (place.kind) {
    case "folder":
      return m.report_saved_in({ folder: place.folder, file });
    case "appFiles":
      return isPhone
        ? m.report_saved_in_files_phone()
        : m.report_saved_in_files_tablet();
  }
}

export function sharedNotice(
  shared: Shared,
  context: NoticeContext,
): Notice | undefined {
  switch (shared.way) {
    case "github":
      return undefined;
    case "copy":
      return {
        tone: "plain",
        icon: CircleCheck,
        title: m.report_copied(),
        body: m.report_kept({ code: context.code }),
      };
    case "save":
      return {
        tone: "plain",
        icon: CircleCheck,
        title: m.report_saved(),
        body: placeOf(shared.saved.place, shared.saved.file, context),
        ...(isPointer(context.platform) ? { action: context.showFolder } : {}),
      };
  }
}
