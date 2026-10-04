import { Info } from "@lucide/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { Platform } from "$lib/ipc/bindings";

import NoticeHost from "./NoticeHost.svelte";
import { Notices, UNDO_WINDOW_MS } from "./notices.svelte";

const REMOVED = "Removed Sample Series 07. Its files stay in the folder.";

const placed: HTMLElement[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const element of placed.splice(0)) {
    element.remove();
  }
});

function placeButtonOnPage(): HTMLButtonElement {
  const button = document.createElement("button");
  document.body.append(button);
  placed.push(button);
  return button;
}

function pressKey(init: KeyboardEventInit): void {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, ...init }),
  );
}

async function offerUndo(platform: Platform = "linux") {
  const notices = new Notices();
  const screen = await render(NoticeHost, { notices, platform });
  let timesUndone = 0;
  notices.offerUndo({
    message: REMOVED,
    undo: () => {
      timesUndone += 1;
    },
  });
  await expect.element(screen.getByText(REMOVED)).toBeVisible();
  return {
    notices,
    status: screen.getByRole("status"),
    undoButton: screen.getByRole("button", { name: "Undo" }),
    timesUndone: () => timesUndone,
  };
}

test("offers to undo a removal politely", async () => {
  const { status, undoButton } = await offerUndo();

  await expect.element(undoButton).toBeVisible();
  await expect.element(status).toHaveTextContent(`${REMOVED} Undo Ctrl Z`);
});

test("undoes from the Undo button and puts the offer away", async () => {
  const { status, undoButton, timesUndone } = await offerUndo();

  await undoButton.click();

  expect(timesUndone()).toBe(1);
  await expect.element(status).toBeEmptyDOMElement();
});

test("undoes with Ctrl Z", async () => {
  const { status, timesUndone } = await offerUndo();

  await userEvent.keyboard("{Control>}z{/Control}");

  expect(timesUndone()).toBe(1);
  await expect.element(status).toBeEmptyDOMElement();
});

test("undoes with Command Z on macOS", async () => {
  const { undoButton, timesUndone } = await offerUndo("macos");

  await userEvent.keyboard("{Meta>}z{/Meta}");

  expect(timesUndone()).toBe(1);
  await expect.element(undoButton).not.toBeInTheDocument();
});

test("undoes with Ctrl Z on a keyboard whose Z key types another script", async () => {
  const { timesUndone } = await offerUndo();

  pressKey({ key: "я", code: "KeyZ", ctrlKey: true });

  expect(timesUndone()).toBe(1);
});

test("follows the printed Z on a Latin keyboard that moves it", async () => {
  const { timesUndone } = await offerUndo();

  pressKey({ key: "w", code: "KeyZ", ctrlKey: true });

  expect(timesUndone()).toBe(0);
});

test.each(["Undo", "Dismiss"])(
  "returns focus to where it came from after %s",
  async (name) => {
    const origin = placeButtonOnPage();
    await offerUndo();
    origin.focus();
    const button = page.getByRole("button", { name });
    button.element().focus();

    await userEvent.keyboard("{Enter}");

    expect(document.activeElement).toBe(origin);
  },
);

test("names the shortcut on the Undo button", async () => {
  const { undoButton } = await offerUndo("macos");

  await expect
    .element(undoButton)
    .toHaveAttribute("aria-keyshortcuts", "Meta+Z");
});

test("leaves Ctrl Z to a text field", async () => {
  const field = document.createElement("input");
  document.body.append(field);
  const { undoButton, timesUndone } = await offerUndo();
  field.focus();

  await userEvent.keyboard("{Control>}z{/Control}");

  expect(timesUndone()).toBe(0);
  await expect.element(undoButton).toBeVisible();
  field.remove();
});

test("lets the offer lapse after a while without undoing", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { status, timesUndone } = await offerUndo();

  vi.advanceTimersByTime(UNDO_WINDOW_MS);

  await expect.element(status).toBeEmptyDOMElement();
  expect(timesUndone()).toBe(0);
});

test("holds the offer while focus is on it", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { undoButton } = await offerUndo();
  undoButton.element().focus();

  vi.advanceTimersByTime(UNDO_WINDOW_MS);

  await expect.element(undoButton).toBeVisible();
});

test("starts the wait again once focus leaves", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { status, undoButton } = await offerUndo();
  undoButton.element().focus();
  vi.advanceTimersByTime(UNDO_WINDOW_MS);

  undoButton.element().blur();
  vi.advanceTimersByTime(UNDO_WINDOW_MS);

  await expect.element(status).toBeEmptyDOMElement();
});

test("lets a new notice replace the offer without undoing", async () => {
  const { notices, status, timesUndone } = await offerUndo();

  notices.show({
    tone: "info",
    icon: Info,
    title: "Sample Library is ready",
    body: "Every comic in it can be read now.",
    actions: [],
  });

  await expect
    .element(status)
    .toHaveTextContent(
      "Sample Library is ready Every comic in it can be read now.",
    );
  expect(timesUndone()).toBe(0);
});
