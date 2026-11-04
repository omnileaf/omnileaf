import { expect, test, vi } from "vitest";

import {
  CopyControl,
  type CopyDependencies,
} from "#lib/copy-control.svelte.ts";
import type { ClipboardWriter } from "#lib/copy-text.ts";

function setup(
  clipboard: ClipboardWriter | undefined,
  settle: CopyDependencies["settle"] = () => Promise.resolve(),
) {
  const select = vi.fn();
  const control = new CopyControl({
    clipboard: () => clipboard,
    select,
    settle,
  });
  return { control, select };
}

test("has said nothing before anything was copied", () => {
  const { control } = setup({ writeText: () => Promise.resolve() });

  expect(control.outcome).toBeUndefined();
});

test("writes exactly the text it is given and says it is copied", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  const { control, select } = setup({ writeText });

  await control.copy("**Report R-1111-1111**\n\ntext");

  expect(writeText).toHaveBeenCalledExactlyOnceWith(
    "**Report R-1111-1111**\n\ntext",
  );
  expect(control.outcome).toBe("copied");
  expect(select).not.toHaveBeenCalled();
});

test("selects the text and says so when the clipboard refuses", async () => {
  const { control, select } = setup({
    writeText: () => Promise.reject(new Error("denied")),
  });

  await control.copy("text");

  expect(control.outcome).toBe("selected");
  expect(select).toHaveBeenCalledOnce();
});

test("selects the text when the browser offers no clipboard", async () => {
  const { control, select } = setup(undefined);

  await control.copy("text");

  expect(control.outcome).toBe("selected");
  expect(select).toHaveBeenCalledOnce();
});

test("clears what it said and lets the page settle before it says it again", async () => {
  const seen: unknown[] = [];
  const made: ReturnType<typeof setup> = setup(
    { writeText: () => Promise.resolve() },
    () => {
      seen.push(made.control.outcome);
      return Promise.resolve();
    },
  );
  await made.control.copy("text");

  await made.control.copy("text");

  expect(seen).toEqual([undefined, undefined]);
  expect(made.control.outcome).toBe("copied");
});

test("asks the browser for the clipboard when it is used, not when it is made", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  const clipboard = vi.fn((): ClipboardWriter | undefined => undefined);
  const control = new CopyControl({
    clipboard,
    select: vi.fn(),
    settle: () => Promise.resolve(),
  });
  expect(clipboard).not.toHaveBeenCalled();
  clipboard.mockReturnValue({ writeText });

  await control.copy("text");

  expect(writeText).toHaveBeenCalledOnce();
});
