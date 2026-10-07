import type { ScanProgress } from "$lib/ipc/bindings";

/** How far a scan in progress has got, as a screen shows it. */
export type ScanStep =
  | { readonly kind: "finding" }
  | {
      readonly kind: "reading";
      readonly scanned: number;
      readonly total: number;
    };

/** Progress can arrive after the result it led to, which must not turn back into a scan in progress. */
export function followScan(
  isScanning: () => boolean,
  show: (step: ScanStep) => void,
): (progress: ScanProgress) => void {
  return (progress) => {
    if (!isScanning()) {
      return;
    }
    show(
      progress.stage === "finding"
        ? { kind: "finding" }
        : {
            kind: "reading",
            scanned: progress.scanned,
            total: progress.total,
          },
    );
  };
}
