import { CircleCheck } from "@lucide/svelte";

import type { Platform, SavedPlace } from "#lib/ipc/bindings.ts";
import type { AppleDevice } from "#lib/library/folder-location.ts";
import type { Notice, NoticeAction } from "#lib/notices/notices.ts";
import { isPointer } from "#lib/page/platform.ts";
import { m } from "#lib/paraglide/messages.js";

import type { Shared } from "./report-sharing.svelte";

const IN_APP_FILES = {
  iphone: m.report_saved_in_files_phone,
  ipad: m.report_saved_in_files_tablet,
} satisfies Record<AppleDevice, () => string>;

export interface NoticeContext {
  readonly code: string;
  readonly platform: Platform;
  readonly appleDevice: AppleDevice;
  readonly showFolder: NoticeAction;
}

function placeOf(
  place: SavedPlace,
  file: string,
  { appleDevice }: NoticeContext,
): string {
  switch (place.kind) {
    case "folder":
      return m.report_saved_in({ folder: place.folder, file });
    case "appFiles":
      return IN_APP_FILES[appleDevice]();
  }
}

export function sharedNotice(
  shared: Shared,
  context: NoticeContext,
): Notice | undefined {
  switch (shared.way) {
    case "send":
      return {
        tone: "plain",
        icon: CircleCheck,
        title: m.report_sent(),
        body: m.report_kept({ code: context.code }),
      };
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
