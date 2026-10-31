import { Eye, Folder, Tag } from "@lucide/svelte";

import { m } from "#lib/paraglide/messages.js";

import type { LabelsFrom } from "./series-selection";

export interface SelectionAction {
  readonly name: string;
  readonly icon: typeof Folder;
  readonly label: string;
  readonly act: () => void;
}

export interface SelectionActionChoices {
  readonly keepsLabels: boolean;
  readonly onLabels: (from: LabelsFrom) => void;
  readonly onMarkRead: () => void;
}

export function selectionActions({
  keepsLabels,
  onLabels,
  onMarkRead,
}: SelectionActionChoices): readonly SelectionAction[] {
  return [
    ...(keepsLabels
      ? [
          {
            name: "categories",
            icon: Folder,
            label: m.library_categories(),
            act: () => {
              onLabels("categories");
            },
          },
          {
            name: "tags",
            icon: Tag,
            label: m.library_tags(),
            act: () => {
              onLabels("tags");
            },
          },
        ]
      : []),
    { name: "read", icon: Eye, label: m.library_mark_read(), act: onMarkRead },
  ];
}
