import { afterEach, expect, test, vi } from "vitest";

import { seriesBookCommands } from "./series-book-commands.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

test("names the list it couldn't bookmark from before its books are read", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const commands = seriesBookCommands({
    listName: () => "volume 2 of series 21",
    listed: () => ({ kind: "loading" }),
    notices: { show: vi.fn() },
    readAgain: () => undefined,
  });

  await commands.bookmark([]);

  expect(reported.mock.calls.map(([error]) => String(error))).toEqual([
    "Error: read the books of volume 2 of series 21 to bookmark them",
  ]);
});
