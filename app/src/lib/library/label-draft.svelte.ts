import type {
  CategoryHeld,
  LabelChanges,
  SeriesLabels,
  TagHeld,
} from "#lib/ipc/bindings.ts";

export type CategoryChoice = "all" | "some" | "none";

export class LabelDraft {
  labels = $state<SeriesLabels | undefined>();
  choices = $state<Record<string, CategoryChoice>>({});
  created = $state<string[]>([]);

  #tagsAdded = $state<string[]>([]);
  #tagsRemoved = $state<string[]>([]);
  readonly #count: () => number;

  constructor(count: () => number) {
    this.#count = count;
  }

  get tagsShown(): TagHeld[] {
    return [
      ...(this.labels?.tags ?? []).filter(
        ({ tag }) => !this.#tagsRemoved.includes(tag),
      ),
      ...this.#tagsAdded.map((tag) => ({ tag, holding: this.#count() })),
    ];
  }

  get suggested(): string[] {
    const shown = this.tagsShown;
    return (this.labels?.suggestedTags ?? []).filter(
      (tag) => !shown.some((each) => each.tag === tag),
    );
  }

  load(labels: SeriesLabels): void {
    this.labels = labels;
    this.choices = Object.fromEntries(
      labels.categories.map((held) => [
        held.category.id,
        this.#startingChoice(held),
      ]),
    );
    this.created = [];
    this.#tagsAdded = [];
    this.#tagsRemoved = [];
  }

  choiceOf({ category }: CategoryHeld): CategoryChoice {
    return this.choices[category.id] ?? "none";
  }

  addCategory(name: string): void {
    const trimmed = name.trim();
    if (trimmed !== "" && !this.created.includes(trimmed)) {
      this.created = [...this.created, trimmed];
    }
  }

  addTag(tag: string): void {
    const name = tag.trim();
    if (name === "") {
      return;
    }
    if (this.#tagsRemoved.includes(name)) {
      this.#tagsRemoved = this.#tagsRemoved.filter((each) => each !== name);
    } else if (!this.tagsShown.some((shown) => shown.tag === name)) {
      this.#tagsAdded = [...this.#tagsAdded, name];
    }
  }

  removeTag(tag: string): void {
    if (this.#tagsAdded.includes(tag)) {
      this.#tagsAdded = this.#tagsAdded.filter((each) => each !== tag);
    } else {
      this.#tagsRemoved = [...this.#tagsRemoved, tag];
    }
  }

  changes(): LabelChanges {
    const held = this.labels?.categories ?? [];
    const count = this.#count();
    return {
      categoriesAdded: held
        .filter(
          ({ category, holding }) =>
            this.choices[category.id] === "all" && holding < count,
        )
        .map(({ category }) => category.id),
      categoriesRemoved: held
        .filter(
          ({ category, holding }) =>
            this.choices[category.id] === "none" && holding > 0,
        )
        .map(({ category }) => category.id),
      categoriesCreated: this.created,
      tagsAdded: this.#tagsAdded,
      tagsRemoved: this.#tagsRemoved,
    };
  }

  #startingChoice({ holding }: CategoryHeld): CategoryChoice {
    if (holding === 0) {
      return "none";
    }
    return holding >= this.#count() ? "all" : "some";
  }
}
