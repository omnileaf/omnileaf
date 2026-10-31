import { assertNever } from "#lib/assert-never.ts";
import type { FolderProblem, MissingFolder } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export interface MissingFolderWording {
  readonly title: string;
  readonly body: string;
}

export type MissingFolderRemedy =
  "showOrFind" | "chooseAgain" | "signIn" | "tryAgain";

const REMEDIES = {
  missing: "showOrFind",
  driveDisconnected: "showOrFind",
  lostAccess: "chooseAgain",
  needsSignIn: "signIn",
  needsMounting: "tryAgain",
  shareUnreachable: "chooseAgain",
} as const satisfies Record<FolderProblem["kind"], MissingFolderRemedy>;

export function remedyOf(missing: MissingFolder): MissingFolderRemedy {
  return REMEDIES[missing.problem.kind];
}

export function wordingOf(
  missing: MissingFolder,
  isStillFailing: boolean,
): MissingFolderWording {
  const { name } = missing.folder;
  const count = missing.hiddenSeries;
  const { problem } = missing;
  switch (problem.kind) {
    case "missing":
      return {
        title: m.missing_folder_title({ name }),
        body: m.missing_folder_body({ name, count }),
      };
    case "driveDisconnected":
      return {
        title: m.missing_drive_title({ name }),
        body: m.missing_drive_body({ name, count }),
      };
    case "lostAccess":
      return {
        title: m.missing_access_title({ name }),
        body: m.missing_access_body(),
      };
    case "needsSignIn":
      return isStillFailing
        ? {
            title: m.missing_sign_in_failed_title({ name }),
            body: m.missing_sign_in_failed_body({ share: problem.share.name }),
          }
        : {
            title: m.missing_sign_in_title({ name }),
            body: m.missing_sign_in_body({ share: problem.share.name }),
          };
    case "needsMounting":
      return {
        title: m.missing_mount_title({ name }),
        body: m.missing_mount_body({ share: problem.share.name }),
      };
    case "shareUnreachable":
      return isStillFailing
        ? {
            title: m.missing_share_failed_title({ name }),
            body: m.missing_share_failed_body({
              share: problem.share.name,
              server: problem.share.server,
            }),
          }
        : {
            title: m.missing_access_title({ name }),
            body: m.missing_share_body({ server: problem.share.server }),
          };
    default:
      return assertNever(problem);
  }
}
