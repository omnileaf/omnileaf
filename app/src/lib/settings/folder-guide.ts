import { m } from "#lib/paraglide/messages.js";

export type FolderDepth = 0 | 1 | 2 | 3;

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

export const FOLDER_RULES: readonly (() => string)[] = [
  m.folder_guide_rule_series,
  m.folder_guide_rule_numbers,
  m.folder_guide_rule_volume_folder,
  m.folder_guide_rule_specials,
  m.folder_guide_rule_one_shot,
  m.folder_guide_rule_above,
  m.folder_guide_rule_details,
];
