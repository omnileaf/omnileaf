export const THUMB_REST_MS = 120;

export class ThumbRest {
  #restingOn: number | undefined = $state();
  #waiting: ReturnType<typeof setTimeout> | undefined;

  get restingOn(): number | undefined {
    return this.#restingOn;
  }

  hold(page: number): void {
    this.letGo();
    this.#waiting = setTimeout(() => {
      this.#restingOn = page;
    }, THUMB_REST_MS);
  }

  heldOn(page: number | undefined): void {
    if (page === undefined) {
      this.letGo();
    } else {
      this.hold(page);
    }
  }

  letGo(): void {
    clearTimeout(this.#waiting);
    this.#waiting = undefined;
    this.#restingOn = undefined;
  }
}
