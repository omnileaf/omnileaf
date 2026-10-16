import { HardDrive, Unplug } from "@lucide/svelte";

import type { FolderProblem, MissingFolder } from "#lib/ipc/bindings.ts";
import type { Glyph } from "#lib/page/glyph.ts";
import { m } from "#lib/paraglide/messages.js";
import { folderStandIn } from "#lib/screenshot-mode/stand-ins.ts";
import { formatBytes } from "#lib/storage/bytes.ts";
import type { DeviceWord } from "#lib/storage/device.ts";

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
  needsMounting: m.missing_mount_title,
  shareUnreachable: m.missing_access_title,
} satisfies Record<FolderProblem["kind"], (inputs: { name: string }) => string>;

const FOLDER_FIXES = {
  missing: m.attention_find,
  driveDisconnected: m.attention_find,
  lostAccess: m.missing_choose_again,
  needsSignIn: m.missing_sign_in,
  needsMounting: m.missing_try_again,
  shareUnreachable: m.missing_choose_again,
} satisfies Record<FolderProblem["kind"], () => string>;

function missingFolderWording(
  { folder, problem, hiddenSeries, isShownAnyway }: MissingFolder,
  usesStandIns: boolean,
): ProblemWording {
  const name = usesStandIns ? folderStandIn(folder.name) : folder.name;
  return {
    icon: Unplug,
    title: FOLDER_TITLES[problem.kind]({ name }),
    detail: isShownAnyway
      ? m.attention_shown_series({ count: hiddenSeries })
      : m.attention_hidden_series({ count: hiddenSeries }),
    fix: FOLDER_FIXES[problem.kind](),
  };
}

const SPACE_LEFT = {
  phone: m.attention_space_left_phone,
  tablet: m.attention_space_left_tablet,
  computer: m.attention_space_left,
} satisfies Record<DeviceWord, (inputs: { size: string }) => string>;

function lowSpaceWording(
  freeBytes: number,
  device: DeviceWord,
): ProblemWording {
  return {
    icon: HardDrive,
    title: m.attention_low_space_title(),
    detail: SPACE_LEFT[device]({ size: formatBytes(freeBytes) }),
    fix: m.attention_free_up_space(),
  };
}

export interface WordingContext {
  readonly usesStandIns: boolean;
  readonly device: DeviceWord;
}

export function problemWording(
  problem: Problem,
  { usesStandIns, device }: WordingContext,
): ProblemWording {
  return problem.kind === "lowSpace"
    ? lowSpaceWording(problem.freeBytes, device)
    : missingFolderWording(problem.missing, usesStandIns);
}
