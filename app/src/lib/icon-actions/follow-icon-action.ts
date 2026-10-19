import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
import { assertNever } from "#lib/assert-never.ts";
import type { IconAction } from "#lib/ipc/bindings.ts";

export interface IconActionTargets {
  readonly toggleScreenshotMode: () => Promise<void>;
  readonly lastUnfinishedBookPage: () => Promise<ResolvedPathname | undefined>;
  readonly open: (page: ResolvedPathname) => Promise<void>;
}

async function continueReading(targets: IconActionTargets): Promise<void> {
  const page = await targets.lastUnfinishedBookPage();
  if (page !== undefined) {
    await targets.open(page);
  }
}

export async function followIconAction(
  action: IconAction,
  targets: IconActionTargets,
): Promise<void> {
  switch (action) {
    case "screenshotMode":
      await targets.toggleScreenshotMode();
      return;
    case "continueReading":
      await continueReading(targets);
      return;
    case "searchLibrary":
      await targets.open(resolve("/(app)/search"));
      return;
    default:
      assertNever(action);
  }
}
