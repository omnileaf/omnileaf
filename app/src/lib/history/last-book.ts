import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
import { commands } from "#lib/ipc/bindings.ts";

export async function lastUnfinishedBookPage(): Promise<
  ResolvedPathname | undefined
> {
  const unfinished = await commands.readingHistory(null, {
    kind: "unfinished",
  });
  const book =
    unfinished.status === "ok" ? unfinished.data.entries[0]?.book : undefined;
  return book === undefined ? undefined : resolve("/read/[book]", { book });
}
