import { createContext } from "svelte";

export type StepState = "completed" | "active" | "inactive";

interface StepperRootOptions {
  readonly current: () => number;
  readonly select: (step: number) => void;
}

class StepperRootState {
  count = $state(0);

  constructor(readonly opts: StepperRootOptions) {}

  register(): number {
    this.count += 1;
    return this.count;
  }
}

class StepperItemState {
  readonly step: number;

  constructor(readonly root: StepperRootState) {
    this.step = root.register();
  }

  get isFirst(): boolean {
    return this.step === 1;
  }

  isLast = $derived.by(() => this.step === this.root.count);

  state: StepState = $derived.by(() => {
    const current = this.root.opts.current();
    if (this.step < current) {
      return "completed";
    }
    return this.step === current ? "active" : "inactive";
  });

  select(): void {
    if (this.state === "completed") {
      this.root.opts.select(this.step);
    }
  }
}

const [getStepperRoot, setStepperRoot] = createContext<StepperRootState>();
const [getStepperItem, setStepperItem] = createContext<StepperItemState>();

export function useStepperRoot(opts: StepperRootOptions): StepperRootState {
  return setStepperRoot(new StepperRootState(opts));
}

export function useStepperItem(): StepperItemState {
  return setStepperItem(new StepperItemState(getStepperRoot()));
}

export { getStepperItem };
