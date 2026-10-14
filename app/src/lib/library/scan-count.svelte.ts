import { useRamp } from "#lib/hooks/use-ramp.svelte.ts";
import { m } from "#lib/paraglide/messages.js";

import type { ScanStep } from "./scan-step";

const SHARE_OF_GAP_PER_STEP = 3;

/** Eases the books found so far up rather than jumping, so it must be called while a component initialises. */
export function scanCount(step: () => ScanStep): {
  readonly label: string | undefined;
} {
  const foundSoFar = $derived.by(() => {
    const current = step();
    return current.kind === "finding" ? current.found : 0;
  });
  let foundShown = $state(0);

  const easing = useRamp({
    increment: () => {
      foundShown += Math.ceil(
        (foundSoFar - foundShown) / SHARE_OF_GAP_PER_STEP,
      );
    },
    canRamp: () => foundShown < foundSoFar,
    startDelay: 0,
    maxFrequency: 40,
    minFrequency: 16,
    rampUpTime: 500,
  });

  $effect(() => {
    if (foundShown < foundSoFar && !easing.active) {
      easing.start();
    }
  });

  $effect(() => easing.reset);

  const label = $derived.by(() => {
    const current = step();
    if (current.kind === "reading") {
      return m.library_scan_progress({
        scanned: current.scanned,
        total: current.total,
      });
    }
    return foundShown > 0
      ? m.library_scan_found_so_far({ found: foundShown })
      : undefined;
  });

  return {
    get label() {
      return label;
    },
  };
}

export function scanFill(
  step: ScanStep,
): { value: number; max: number } | { value: null } {
  return step.kind === "reading"
    ? { value: step.scanned, max: step.total }
    : { value: null };
}
