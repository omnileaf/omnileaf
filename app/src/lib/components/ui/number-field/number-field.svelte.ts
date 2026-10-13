import { createContext } from "svelte";

export type StepDirection = "down" | "up";

interface NumberFieldOptions {
  readonly value: () => number;
  readonly change: (value: number) => void;
  readonly step: () => number;
  readonly min: () => number | undefined;
  readonly max: () => number | undefined;
}

class NumberFieldState {
  constructor(private readonly opts: NumberFieldOptions) {}

  canStep(direction: StepDirection): boolean {
    const next = this.next(direction);
    if (direction === "up") {
      const max = this.opts.max();
      return max === undefined || next <= max;
    }
    const min = this.opts.min();
    return min === undefined || next >= min;
  }

  step(direction: StepDirection): void {
    if (this.canStep(direction)) {
      this.opts.change(this.next(direction));
    }
  }

  private next(direction: StepDirection): number {
    const step = this.opts.step();
    return this.opts.value() + (direction === "up" ? step : -step);
  }
}

const [getNumberField, setNumberField] = createContext<NumberFieldState>();

export function useNumberField(opts: NumberFieldOptions): NumberFieldState {
  return setNumberField(new NumberFieldState(opts));
}

export { getNumberField };
