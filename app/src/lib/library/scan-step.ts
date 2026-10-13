import type { ScanProgress } from "#lib/ipc/bindings.ts";

export type ScanStep =
  | { readonly kind: "finding"; readonly found: number }
  | {
      readonly kind: "reading";
      readonly scanned: number;
      readonly total: number;
    };

/** A Tauri channel can deliver progress after the command's result, which must not turn back into a scan in progress. */
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
        ? { kind: "finding", found: progress.found }
        : {
            kind: "reading",
            scanned: progress.scanned,
            total: progress.total,
          },
    );
  };
}
