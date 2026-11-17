import { commands } from "#lib/ipc/bindings.ts";

export async function takeRestoredRoute(): Promise<string | undefined> {
  const taken = await commands.takeRestoredRoute();
  if (taken.status === "error") {
    reportError(taken.error);
    return undefined;
  }
  return taken.data ?? undefined;
}
