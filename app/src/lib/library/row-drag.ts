export interface Slot {
  readonly top: number;
  readonly height: number;
}

export class RowDrag {
  readonly from: number;
  readonly #slots: readonly Slot[];
  readonly #startY: number;
  readonly #pointerY: number;

  constructor(
    from: number,
    slots: readonly Slot[],
    startY: number,
    pointerY: number = startY,
  ) {
    this.from = from;
    this.#slots = slots;
    this.#startY = startY;
    this.#pointerY = pointerY;
  }

  to(pointerY: number): RowDrag {
    return new RowDrag(this.from, this.#slots, this.#startY, pointerY);
  }

  get offset(): number {
    const first = this.#slots[0];
    const last = this.#slots.at(-1);
    if (first === undefined || last === undefined) {
      return 0;
    }
    const dragged = this.#dragged;
    const lowest = first.top - dragged.top;
    const highest = last.top + last.height - dragged.height - dragged.top;
    return Math.min(Math.max(this.#pointerY - this.#startY, lowest), highest);
  }

  get gap(): number {
    const top = this.#dragged.top + this.offset;
    const bottom = top + this.#dragged.height;
    const passedBelow = this.#slots
      .slice(this.from + 1)
      .filter((slot) => bottom > middleOf(slot)).length;
    const passedAbove = this.#slots
      .slice(0, this.from)
      .filter((slot) => top < middleOf(slot)).length;
    return this.from + passedBelow - passedAbove;
  }

  shiftOf(index: number): number {
    const gap = this.gap;
    const height = this.#dragged.height;
    if (this.from < index && index <= gap) {
      return -height;
    }
    if (gap <= index && index < this.from) {
      return height;
    }
    return 0;
  }

  get #dragged(): Slot {
    const slot = this.#slots[this.from];
    if (slot === undefined) {
      throw new RangeError(`no row ${String(this.from)} to drag`);
    }
    return slot;
  }
}

function middleOf({ top, height }: Slot): number {
  return top + height / 2;
}
