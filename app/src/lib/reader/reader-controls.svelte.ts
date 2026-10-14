/** Whether the reader's controls are up: once the book's first page is drawn they go a while after they are, unless the pointer rests on them or a control has keyboard focus. */
export class ReaderControls {
  #isShown = $state(true);
  #drawing: number | undefined;
  #hiding: ReturnType<typeof setTimeout> | undefined;
  #isPointerOver = false;
  #isFocused = false;
  #isHeld = false;

  constructor(private readonly hideAfterMs: number) {}

  get isShown(): boolean {
    return this.#isShown;
  }

  bookOpened(): void {
    if (!this.#isShown) {
      return;
    }
    this.stop();
    this.#drawing = requestAnimationFrame(() => {
      this.#hideLater();
    });
  }

  show(): void {
    this.#isShown = true;
    this.#hideLater();
  }

  /** Also forgets the pointer, which no longer rests on controls hidden from under it. */
  hide(): void {
    this.stop();
    this.#isPointerOver = false;
    this.#isShown = false;
  }

  toggle(): void {
    if (this.#isShown) {
      this.hide();
    } else {
      this.show();
    }
  }

  pointerEntered(): void {
    this.#isPointerOver = true;
  }

  pointerLeft(): void {
    this.#isPointerOver = false;
    this.#hideLater();
  }

  focused(): void {
    this.#isFocused = true;
    this.show();
  }

  blurred(): void {
    this.#isFocused = false;
    this.#hideLater();
  }

  hold(): void {
    this.#isHeld = true;
    this.show();
  }

  release(): void {
    this.#isHeld = false;
    this.#hideLater();
  }

  stop(): void {
    if (this.#drawing !== undefined) {
      cancelAnimationFrame(this.#drawing);
    }
    clearTimeout(this.#hiding);
    this.#drawing = undefined;
    this.#hiding = undefined;
  }

  #hideLater(): void {
    this.stop();
    this.#drawing = requestAnimationFrame(() => {
      this.#drawing = undefined;
      this.#hiding = setTimeout(() => {
        this.#hiding = undefined;
        if (!this.#isPointerOver && !this.#isFocused && !this.#isHeld) {
          this.hide();
        }
      }, this.hideAfterMs);
    });
  }
}
