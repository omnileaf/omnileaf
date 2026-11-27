export interface TapPoint {
  readonly at: number;
  readonly x: number;
  readonly y: number;
}

export class DoubleTapWindow {
  #lift: TapPoint | undefined;

  constructor(
    readonly windowMs: number,
    readonly slopPx: number,
  ) {}

  lifted(point: TapPoint): void {
    this.#lift = point;
  }

  isSecondTap(press: TapPoint): boolean {
    const lift = this.#lift;
    return (
      lift !== undefined &&
      press.at - lift.at <= this.windowMs &&
      Math.hypot(press.x - lift.x, press.y - lift.y) <= this.slopPx
    );
  }

  leftAfter(now: number): number {
    const lift = this.#lift;
    return lift === undefined
      ? this.windowMs
      : Math.max(0, this.windowMs - (now - lift.at));
  }
}
