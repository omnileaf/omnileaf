import { CircleAlert, CircleCheck, TriangleAlert } from "@lucide/svelte";

import type { DropOutcome, FolderScan } from "#lib/ipc/bindings.ts";
import type { Notice, Notices } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

function addedNotice(
  scan: FolderScan,
  folderName: (scan: FolderScan) => string,
): Notice {
  const name = folderName(scan);
  return scan.books === 0
    ? {
        tone: "plain",
        icon: CircleAlert,
        title: m.library_folder_no_books({ name }),
      }
    : {
        tone: "plain",
        icon: CircleCheck,
        title: m.library_scan_added({ books: scan.books, name }),
      };
}

export function droppedNotices(
  outcome: DropOutcome,
  folderName: (scan: FolderScan) => string,
): Notice[] {
  switch (outcome.kind) {
    case "added":
      return outcome.folders.map((scan) => addedNotice(scan, folderName));
    case "copied":
      return [
        {
          tone: "plain",
          icon: CircleCheck,
          title: m.drop_copied({ count: outcome.files }),
        },
      ];
    case "reading":
      return [];
  }
}

function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

export function unreadableFileNotice(error: unknown): Notice | undefined {
  switch (codeOf(error)) {
    case "bookUnreadable":
      return {
        tone: "warning",
        icon: TriangleAlert,
        title: m.reader_unreadable(),
        body: m.reader_unreadable_body(),
      };
    case "bookTypeUnsupported":
      return {
        tone: "warning",
        icon: TriangleAlert,
        title: m.reader_unsupported_title(),
        body: m.reader_unsupported_body_unnamed(),
      };
    default:
      return undefined;
  }
}

export function reportFileFailure(
  notices: Pick<Notices, "show">,
  error: unknown,
  report: (error: unknown) => void,
): void {
  const notice = unreadableFileNotice(error);
  if (notice === undefined) {
    report(error);
  } else {
    notices.show(notice);
  }
}
