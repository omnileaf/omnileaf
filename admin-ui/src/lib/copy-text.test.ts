import { expect, test, vi } from "vitest";

import { copyText } from "#lib/copy-text.ts";

test("writes the text to the clipboard and reports it copied", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  const select = vi.fn();

  const outcome = await copyText({
    text: "Report R-1111-1111",
    clipboard: { writeText },
    select,
  });

  expect(outcome).toBe("copied");
  expect(writeText).toHaveBeenCalledExactlyOnceWith("Report R-1111-1111");
  expect(select).not.toHaveBeenCalled();
});

test("selects the text for the person to copy when the clipboard refuses", async () => {
  const select = vi.fn();

  const outcome = await copyText({
    text: "text",
    clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    select,
  });

  expect(outcome).toBe("selected");
  expect(select).toHaveBeenCalledOnce();
});

test("selects the text when the clipboard throws before it answers", async () => {
  const select = vi.fn();

  const outcome = await copyText({
    text: "text",
    clipboard: {
      writeText: () => {
        throw new Error("not allowed");
      },
    },
    select,
  });

  expect(outcome).toBe("selected");
  expect(select).toHaveBeenCalledOnce();
});

test("selects the text when the browser has no clipboard", async () => {
  const select = vi.fn();

  const outcome = await copyText({
    text: "text",
    clipboard: undefined,
    select,
  });

  expect(outcome).toBe("selected");
  expect(select).toHaveBeenCalledOnce();
});
