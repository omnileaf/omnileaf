import { Unplug } from "@lucide/svelte";

import type { FolderProblem, MissingFolder } from "#lib/ipc/bindings.ts";
import type { Glyph } from "#lib/page/glyph.ts";
import { m } from "#lib/paraglide/messages.js";
import { folderStandIn } from "#lib/screenshot-mode/stand-ins.ts";

import type { Problem } from "./needs-attention.svelte";

export interface ProblemWording {
  readonly icon: Glyph;
  readonly title: string;
  readonly detail: string;
  readonly fix: string;
}

const FOLDER_TITLES = {
  missing: m.missing_folder_title,
  driveDisconnected: m.attention_drive_title,
  lostAccess: m.missing_access_title,
  needsSignIn: m.missing_sign_in_title,
} satisfies Record<FolderProblem, (inputs: { name: string }) => string>;

const FOLDER_FIXES = {
  missing: m.attention_find,
  driveDisconnected: m.attention_find,
  lostAccess: m.missing_choose_again,
  needsSignIn: m.missing_sign_in,
} satisfies Record<FolderProblem, () => string>;

function missingFolderWording(
  { folder, problem, hiddenSeries, isShownAnyway }: MissingFolder,
  usesStandIns: boolean,
): ProblemWording {
  const name = usesStandIns ? folderStandIn(folder.name) : folder.name;
  return {
    icon: Unplug,
    title: FOLDER_TITLES[problem]({ name }),
    detail: isShownAnyway
      ? m.attention_shown_series({ count: hiddenSeries })
      : m.attention_hidden_series({ count: hiddenSeries }),
    fix: FOLDER_FIXES[problem](),
  };
}

export function problemWording(
  problem: Problem,
  usesStandIns: boolean,
): ProblemWording {
  return missingFolderWording(problem.missing, usesStandIns);
}
