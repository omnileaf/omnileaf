import type { SeriesPerson } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

import { roleName } from "./creator-role.ts";
import type { ChangedField, EditableField } from "./detail-edits.ts";

const CHANGED_NAMES = {
  title: () => m.edit_details_changed_title(),
  people: () => m.edit_details_changed_people(),
  tags: () => m.edit_details_changed_tags(),
  summary: () => m.edit_details_changed_summary(),
  adultMark: () => m.edit_details_changed_adult_mark(),
} satisfies Record<ChangedField, () => string>;

const USE_FILE_LABELS = {
  title: () => m.edit_details_use_file_title(),
  people: () => m.edit_details_use_file_people(),
  tags: () => m.edit_details_use_file_tags(),
  summary: () => m.edit_details_use_file_summary(),
} satisfies Record<EditableField, () => string>;

const BACK_TO_FILE_TITLES = {
  title: () => m.edit_details_title_back(),
  people: () => m.edit_details_people_back(),
  tags: () => m.edit_details_tags_back(),
  summary: () => m.edit_details_summary_back(),
} satisfies Record<EditableField, () => string>;

export function personLabel(person: SeriesPerson): string {
  return person.role === null
    ? person.name
    : m.edit_details_person({ role: roleName(person.role), name: person.name });
}

export function removePersonLabel(person: SeriesPerson): string {
  return person.role === null
    ? m.edit_details_remove_named({ name: person.name })
    : m.edit_details_remove_person({
        name: person.name,
        role: roleName(person.role).toLocaleLowerCase(getLocale()),
      });
}

export function fileValuesWording(values: readonly string[]): string {
  return m.edit_details_from_file_listed({
    values: new Intl.ListFormat(getLocale(), {
      type: "unit",
      style: "short",
    }).format(values),
  });
}

export function changedWording(fields: readonly ChangedField[]): string {
  const named = new Intl.ListFormat(getLocale(), {
    type: "conjunction",
  }).format(fields.map((field) => CHANGED_NAMES[field]()));
  const first = named.at(0)?.toLocaleUpperCase(getLocale()) ?? "";
  return m.edit_details_changed({ fields: `${first}${named.slice(1)}` });
}

export function useFileLabel(field: EditableField): string {
  return USE_FILE_LABELS[field]();
}

export function backToFileTitle(field: EditableField): string {
  return BACK_TO_FILE_TITLES[field]();
}
