import { touchChoices } from "#lib/accessibility/touch-choices.svelte.ts";

export class LongPress {
  #holding: ReturnType<typeof setTimeout> | undefined;
  #wasHeld = false;

  constructor(
    private readonly heldMs: () => number = () => touchChoices.longPressMs,
  ) {}

  get wasHeld(): boolean {
    return this.#wasHeld;
  }

  pressed(event: PointerEvent, onHeld: () => void): void {
    if (event.pointerType === "mouse") {
      return;
    }
    this.released();
    this.#holding = setTimeout(() => {
      this.#holding = undefined;
      this.#wasHeld = true;
      onHeld();
    }, this.heldMs());
  }

  released(): void {
    clearTimeout(this.#holding);
    this.#holding = undefined;
  }

  pointerWentDown(): void {
    this.#wasHeld = false;
  }

  clicked(event: MouseEvent): void {
    if (this.#wasHeld) {
      this.#wasHeld = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
