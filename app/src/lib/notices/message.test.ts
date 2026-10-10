import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import NoticeHost from "./NoticeHost.svelte";
import { MESSAGE_WINDOW_MS, Notices } from "./notices.svelte";

const REMOVED = "3 books removed";

afterEach(() => {
  vi.useRealTimers();
});

async function tell() {
  const notices = new Notices();
  const screen = await render(NoticeHost, { notices, platform: "linux" });
  notices.tell(REMOVED);
  return { notices, status: screen.getByRole("status") };
}

test("tells a message politely, with nothing to act on", async () => {
  const { status } = await tell();

  await expect.element(status).toHaveTextContent(REMOVED);
  expect(status.getByRole("button").elements()).toEqual([]);
});

test("puts the message away after a few seconds", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { status } = await tell();
  await expect.element(status).toHaveTextContent(REMOVED);

  vi.advanceTimersByTime(MESSAGE_WINDOW_MS);

  await expect.element(status).toBeEmptyDOMElement();
});

test("lets an offer to undo replace the message", async () => {
  const { notices, status } = await tell();

  notices.offerUndo({
    message: "Removed Sample Series 07.",
    undo: () => undefined,
  });

  await expect.element(status).not.toHaveTextContent(REMOVED);
  expect(notices.message).toBeUndefined();
});
