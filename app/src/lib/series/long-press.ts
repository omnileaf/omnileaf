/** Tells a finger held on a row from a tap, and swallows the click a held finger ends with. */
export class LongPress {
  #holding: ReturnType<typeof setTimeout> | undefined;
  #isClickSwallowed = false;

  constructor(private readonly heldMs: number) {}

  pressed(event: PointerEvent, onHeld: () => void): void {
    if (event.pointerType === "mouse") {
      return;
    }
    this.released();
    this.#holding = setTimeout(() => {
      this.#holding = undefined;
      this.#isClickSwallowed = true;
      onHeld();
    }, this.heldMs);
  }

  released(): void {
    clearTimeout(this.#holding);
    this.#holding = undefined;
  }

  pointerWentDown(): void {
    this.#isClickSwallowed = false;
  }

  clicked(event: MouseEvent): void {
    if (this.#isClickSwallowed) {
      this.#isClickSwallowed = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
