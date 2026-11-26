import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
import { GROUPED_GROUP_LOOK } from "#lib/library/group-look.ts";
import { GROUP_PLATE } from "#lib/page/plates.ts";

import { FLUSH_LIST, FLUSH_LIST_HEADING } from "./android-flush-look.ts";
import type { EntryKind } from "./folder-guide.ts";

export interface NativeGuideLook {
  readonly page: string;
  readonly intro: string;
  readonly tree: string;
  readonly treeIconSize: number;
  readonly rulesHeading: string;
  readonly groupHeading: string;
  readonly rules: string;
  readonly lead: string;
  readonly threeLineRow: string;
}

const ROW_TITLE_TYPE =
  "text-native-row-title/native-row-title tracking-native-row-title";

export const ANDROID_GUIDE_LOOK: NativeGuideLook = {
  page: "",
  intro: `pbe-sm ${ROW_TITLE_TYPE}`,
  tree: "mbs-sm rounded-card px-lg py-xl inset-ring inset-ring-border",
  treeIconSize: 24,
  rulesHeading:
    "pbs-xl pbe-sm text-native-group-heading/native-group-heading font-native-group-heading tracking-native-group-heading",
  groupHeading: FLUSH_LIST_HEADING,
  rules: FLUSH_LIST,
  lead: "",
  threeLineRow: "items-start py-md",
};

export const IOS_GUIDE_LOOK: NativeGuideLook = {
  page: "gap-lg",
  intro: `px-lg ${ROW_TITLE_TYPE}`,
  tree: `py-sm ${GROUP_PLATE}`,
  treeIconSize: 18,
  rulesHeading: `px-lg pbs-sm font-semibold ${ROW_TITLE_TYPE}`,
  groupHeading: GROUPED_GROUP_LOOK.heading,
  rules: `row-rules overflow-hidden ${GROUP_PLATE}`,
  lead: "inline-native-row-lead",
  threeLineRow: "",
};

export const ENTRY_TINTS = {
  folder: "text-accent",
  file: "text-muted",
} satisfies Record<EntryKind, string>;

export const TREE_READING_TYPE =
  "text-native-group-footer/native-group-footer tracking-native-group-footer text-muted";

export const RULE_NAMES_TYPE = `font-mono ${ROW_SUBTITLE_TYPE}`;
