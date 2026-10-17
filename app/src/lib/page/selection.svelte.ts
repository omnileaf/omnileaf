import { SvelteSet } from "svelte/reactivity";

export class Selection<Id> {
  isSelecting = $state(false);

  readonly #picked = new SvelteSet<Id>();
  #anchor: Id | undefined;

  get count(): number {
    return this.#picked.size;
  }

  has(item: Id): boolean {
    return this.#picked.has(item);
  }

  hasAll(listed: readonly Id[]): boolean {
    return listed.length > 0 && listed.every((item) => this.#picked.has(item));
  }

  begin(item?: Id): void {
    this.isSelecting = true;
    if (item !== undefined) {
      this.toggle(item);
    }
  }

  toggle(item: Id): void {
    if (!this.#picked.delete(item)) {
      this.#picked.add(item);
    }
    this.#anchor = item;
  }

  extendTo(item: Id, listed: readonly Id[]): void {
    const end = listed.indexOf(item);
    if (end === -1) {
      return;
    }
    const anchor =
      this.#anchor === undefined ? -1 : listed.indexOf(this.#anchor);
    const start = anchor === -1 ? end : anchor;
    const [first, last] = start <= end ? [start, end] : [end, start];
    this.pickAll(listed.slice(first, last + 1));
    this.#anchor = item;
  }

  pickAll(listed: readonly Id[]): void {
    for (const item of listed) {
      this.#picked.add(item);
    }
  }

  pickOnly(listed: readonly Id[], kept: readonly Id[] = []): void {
    this.#picked.clear();
    this.pickAll(kept);
    this.pickAll(listed);
  }

  /** Every item picked, in the order it was picked, whether the list shows it now or not. */
  get picked(): Id[] {
    return [...this.#picked];
  }

  end(): void {
    this.isSelecting = false;
    this.#picked.clear();
    this.#anchor = undefined;
  }
}
