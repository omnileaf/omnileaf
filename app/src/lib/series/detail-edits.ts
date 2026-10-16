import type {
  DetailEdits,
  SeriesDetails,
  SeriesPerson,
} from "#lib/ipc/bindings.ts";

export type TextField = "title" | "summary";
export type ListField = "people" | "tags";
export type EditableField = TextField | ListField;
export type ChangedField = EditableField | "adultMark";

export interface DetailDraft {
  readonly title: string;
  readonly people: readonly SeriesPerson[];
  readonly tags: readonly string[];
  readonly summary: string;
  readonly isMarkedAdult: boolean;
}

const FIELD_ORDER: readonly ChangedField[] = [
  "title",
  "people",
  "tags",
  "summary",
  "adultMark",
];

export function draftOf(details: SeriesDetails): DetailDraft {
  return {
    title: details.title.edited ?? details.title.fromFile,
    people: details.people.edited ?? details.people.fromFile,
    tags: details.tags.edited ?? details.tags.fromFile,
    summary: details.summary.edited ?? details.summary.fromFile ?? "",
    isMarkedAdult: details.isMarkedAdult,
  };
}

function fileDraftOf(details: SeriesDetails): DetailDraft {
  return {
    title: details.title.fromFile,
    people: details.people.fromFile,
    tags: details.tags.fromFile,
    summary: details.summary.fromFile ?? "",
    isMarkedAdult: details.isMarkedAdult,
  };
}

function samePeople(
  one: readonly SeriesPerson[],
  other: readonly SeriesPerson[],
): boolean {
  return (
    one.length === other.length &&
    one.every(
      (person, index) =>
        person.name === other[index]?.name && person.role === other[index].role,
    )
  );
}

function sameTags(one: readonly string[], other: readonly string[]): boolean {
  return (
    one.length === other.length &&
    one.every((tag, index) => tag === other[index])
  );
}

function isSame(
  field: ChangedField,
  one: DetailDraft,
  other: DetailDraft,
): boolean {
  switch (field) {
    case "title":
      return one.title.trim() === other.title.trim();
    case "summary":
      return one.summary.trim() === other.summary.trim();
    case "people":
      return samePeople(one.people, other.people);
    case "tags":
      return sameTags(one.tags, other.tags);
    case "adultMark":
      return one.isMarkedAdult === other.isMarkedAdult;
  }
}

export function isEdited(
  field: EditableField,
  details: SeriesDetails,
  draft: DetailDraft,
): boolean {
  return (
    !isLeftEmpty(field, draft) && !isSame(field, draft, fileDraftOf(details))
  );
}

export function isLeftEmpty(field: EditableField, draft: DetailDraft): boolean {
  return (
    (field === "title" || field === "summary") && draft[field].trim() === ""
  );
}

export function withFileValue(
  field: EditableField,
  details: SeriesDetails,
  draft: DetailDraft,
): DetailDraft {
  const file = fileDraftOf(details);
  return { ...draft, [field]: file[field] };
}

export function changesBetween(
  before: DetailDraft,
  after: DetailDraft,
): ChangedField[] {
  return FIELD_ORDER.filter((field) => !isSame(field, before, after));
}

function typedOver(typed: string, fromFile: string | null): string | null {
  const kept = typed.trim();
  return kept === "" || kept === fromFile ? null : kept;
}

export function editsOf(
  details: SeriesDetails,
  draft: DetailDraft,
): DetailEdits {
  return {
    title: typedOver(draft.title, details.title.fromFile),
    people: isEdited("people", details, draft) ? [...draft.people] : null,
    tags: isEdited("tags", details, draft) ? [...draft.tags] : null,
    summary: typedOver(draft.summary, details.summary.fromFile),
    isMarkedAdult: draft.isMarkedAdult,
  };
}
