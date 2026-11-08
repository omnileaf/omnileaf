import { Eye, Folder, Tag } from "@lucide/svelte";

import type { IconName } from "#lib/icons/names.ts";
import { m } from "#lib/paraglide/messages.js";

import type { LabelsFrom } from "./series-selection";

export interface SelectionAction {
  readonly name: string;
  readonly icon: typeof Folder;
  readonly iconName: IconName;
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
  const labelActions: readonly SelectionAction[] = keepsLabels
    ? [
        {
          name: "categories",
          icon: Folder,
          iconName: "folder",
          label: m.library_categories(),
          act: () => {
            onLabels("categories");
          },
        },
        {
          name: "tags",
          icon: Tag,
          iconName: "tag",
          label: m.library_tags(),
          act: () => {
            onLabels("tags");
          },
        },
      ]
    : [];
  return [
    ...labelActions,
    {
      name: "read",
      icon: Eye,
      iconName: "eye",
      label: m.library_mark_read(),
      act: onMarkRead,
    },
  ];
}
