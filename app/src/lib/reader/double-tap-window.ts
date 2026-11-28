/** Android took a second tap 308 ms after the first lift as a double tap and refused one at 385 ms, so the reader's window reaches just past the first. */
const READER_WINDOW_MS = 310;
/** Android's double-tap slop, how far apart two taps may land and still make one double tap. */
const READER_SLOP_PX = 100;

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

export function readerTapWindow(): DoubleTapWindow {
  return new DoubleTapWindow(READER_WINDOW_MS, READER_SLOP_PX);
}
