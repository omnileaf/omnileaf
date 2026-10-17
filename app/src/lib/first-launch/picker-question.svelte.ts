export class PickerQuestion {
  isAsking = $state(false);
  #hasGoneOn = false;
  #answer: ((goesOn: boolean) => void) | undefined;

  constructor(private readonly asksFirst: () => boolean) {}

  ask(): Promise<boolean> {
    if (!this.asksFirst() || this.#hasGoneOn) {
      return Promise.resolve(true);
    }
    this.isAsking = true;
    return new Promise((resolve) => {
      this.#answer = resolve;
    });
  }

  answer(goesOn: boolean): void {
    this.isAsking = false;
    this.#hasGoneOn ||= goesOn;
    this.#answer?.(goesOn);
    this.#answer = undefined;
  }
}
