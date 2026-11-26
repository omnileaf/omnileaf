import type { IconName } from "#lib/icons/names.ts";
import { m } from "#lib/paraglide/messages.js";

export type FolderDepth = 0 | 1 | 2 | 3;

export const FOLDER_INDENTS = {
  0: "",
  1: "ps-folder-depth-1",
  2: "ps-folder-depth-2",
  3: "ps-folder-depth-3",
} satisfies Record<FolderDepth, string>;

export interface ExampleEntry {
  readonly name: string;
  readonly isFolder: boolean;
  readonly depth: FolderDepth;
  readonly readAs: () => string;
}

export const EXAMPLE_FOLDER: readonly ExampleEntry[] = [
  { name: "Comics", isFolder: true, depth: 0, readAs: m.folder_guide_linked },
  {
    name: "Sample Series 04 (2019)",
    isFolder: true,
    depth: 1,
    readAs: () => m.folder_guide_series_from({ year: "2019" }),
  },
  {
    name: "Sample Series 04 v01.cbz",
    isFolder: false,
    depth: 2,
    readAs: () => m.folder_guide_volume({ number: "1" }),
  },
  {
    name: "Sample Series 04 v02.cbz",
    isFolder: false,
    depth: 2,
    readAs: () => m.folder_guide_volume({ number: "2" }),
  },
  {
    name: "Volume 03",
    isFolder: true,
    depth: 2,
    readAs: () => m.folder_guide_volume_of_chapters({ number: "3" }),
  },
  {
    name: "Chapter 017.cbz",
    isFolder: false,
    depth: 3,
    readAs: () =>
      m.folder_guide_chapter_in_volume({ chapter: "17", volume: "3" }),
  },
  {
    name: "Sample Series 04 c097.cbz",
    isFolder: false,
    depth: 2,
    readAs: () => m.folder_guide_chapter_after({ number: "97" }),
  },
  {
    name: "Specials",
    isFolder: true,
    depth: 2,
    readAs: m.folder_guide_extras,
  },
  {
    name: "Summer Short.cbz",
    isFolder: false,
    depth: 3,
    readAs: m.folder_guide_special,
  },
  {
    name: "Author B",
    isFolder: true,
    depth: 1,
    readAs: m.folder_guide_writer_folder,
  },
  {
    name: "Sample Series 02",
    isFolder: true,
    depth: 2,
    readAs: m.folder_guide_series,
  },
  {
    name: "Sample Series 05.cbz",
    isFolder: false,
    depth: 1,
    readAs: m.folder_guide_one_shot,
  },
];

export type EntryKind = "folder" | "file";

export interface NamingRule {
  readonly title: () => string;
  readonly names: readonly string[];
  readonly note?: () => string;
}

export interface NamingRuleGroup {
  readonly kind: EntryKind;
  readonly heading: () => string;
  readonly rules: readonly NamingRule[];
}

export const NAME_SEPARATOR = "·";

export const NAMING_RULES: readonly NamingRuleGroup[] = [
  {
    kind: "folder",
    heading: m.folder_guide_folders,
    rules: [
      {
        title: m.folder_guide_rule_series,
        names: ["Sample Series 04 (2019)"],
        note: m.folder_guide_rule_series_note,
      },
      {
        title: m.folder_guide_rule_volume_folder,
        names: ["Volume 03"],
        note: m.folder_guide_rule_volume_folder_note,
      },
      {
        title: m.folder_guide_rule_specials,
        names: ["Specials"],
        note: m.folder_guide_rule_specials_note,
      },
      {
        title: m.folder_guide_rule_above,
        names: ["Author B"],
        note: m.folder_guide_rule_above_note,
      },
    ],
  },
  {
    kind: "file",
    heading: m.folder_guide_files,
    rules: [
      {
        title: m.folder_guide_rule_volume,
        names: ["Volume 1", "Vol. 01", "v01"],
      },
      {
        title: m.folder_guide_rule_chapter,
        names: ["Chapter 12", "Ch. 12", "c012"],
      },
      {
        title: m.folder_guide_rule_one_shot,
        names: [],
        note: m.folder_guide_rule_one_shot_note,
      },
      {
        title: m.folder_guide_rule_other_names,
        names: [],
        note: m.folder_guide_rule_other_names_note,
      },
      {
        title: m.folder_guide_rule_details,
        names: ["ComicInfo.xml"],
        note: m.folder_guide_rule_details_note,
      },
    ],
  },
];

export const ENTRY_ICONS = {
  folder: "folder",
  file: "file-text",
} satisfies Record<EntryKind, IconName>;

export function takesThreeLines(rule: NamingRule): boolean {
  return rule.names.length > 0 && rule.note !== undefined;
}

export function kindOf(entry: ExampleEntry): EntryKind {
  return entry.isFolder ? "folder" : "file";
}
