import { resolve } from "$app/paths";
import { assertNever } from "#lib/assert-never.ts";
import type { IconAction } from "#lib/ipc/bindings.ts";

export interface IconActionTargets {
  readonly toggleScreenshotMode: () => void;
  readonly lastUnfinishedBookPage: () => Promise<string | undefined>;
  readonly open: (page: string) => Promise<void>;
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
      targets.toggleScreenshotMode();
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
