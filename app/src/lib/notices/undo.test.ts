import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { Platform } from "#lib/ipc/bindings.ts";

import { clearToasts } from "../../../tests/components/clear-toasts";
import "../../app.css";

import { Notices, UNDO_WINDOW_MS } from "./notices";
import Toasts from "./Toasts.svelte";

const REMOVED = "Removed Sample Series 07";
const FILES_KEPT = "Its files stay on the SD card.";

const placed: HTMLElement[] = [];

afterEach(async () => {
  for (const element of placed.splice(0)) {
    element.remove();
  }
  await clearToasts();
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
  await render(Toasts, { notices, platform, theme: "light" });
  let timesUndone = 0;
  notices.offerUndo({
    title: REMOVED,
    body: FILES_KEPT,
    undo: () => {
      timesUndone += 1;
    },
  });
  const offer = page.getByRole("listitem").filter({ hasText: REMOVED });
  await expect.element(offer).toBeVisible();
  return {
    notices,
    offer,
    undoButton: page.getByRole("button", { name: "Undo" }),
    timesUndone: () => timesUndone,
  };
}

test("offers to undo a removal, naming the shortcut", async () => {
  const { offer, undoButton } = await offerUndo();

  await expect.element(undoButton).toBeVisible();
  await expect
    .element(offer)
    .toHaveTextContent(`${REMOVED} ${FILES_KEPT} Undo Ctrl Z`);
  await expect.element(offer).toHaveAttribute("aria-live", "polite");
});

test("undoes from the Undo button and puts the offer away", async () => {
  const { offer, undoButton, timesUndone } = await offerUndo();

  await undoButton.click();

  expect(timesUndone()).toBe(1);
  await expect.element(offer).not.toBeInTheDocument();
});

test("undoes with Ctrl Z", async () => {
  const { offer, timesUndone } = await offerUndo();

  await userEvent.keyboard("{Control>}z{/Control}");

  expect(timesUndone()).toBe(1);
  await expect.element(offer).not.toBeInTheDocument();
});

test("undoes with Command Z on macOS", async () => {
  const { offer, timesUndone } = await offerUndo("macos");

  await userEvent.keyboard("{Meta>}z{/Meta}");

  expect(timesUndone()).toBe(1);
  await expect.element(offer).not.toBeInTheDocument();
});

test("names Command Z on macOS", async () => {
  const { offer, undoButton } = await offerUndo("macos");

  await expect
    .element(offer)
    .toHaveTextContent(`${REMOVED} ${FILES_KEPT} Undo ⌘ Z`);
  await expect
    .element(undoButton)
    .toHaveAttribute("aria-keyshortcuts", "Meta+Z");
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

test("undoes only once when Ctrl Z is pressed twice", async () => {
  const { timesUndone } = await offerUndo();

  await userEvent.keyboard("{Control>}z{/Control}");
  await userEvent.keyboard("{Control>}z{/Control}");

  expect(timesUndone()).toBe(1);
});

test.each(["Undo", "Dismiss"])(
  "returns focus to where it came from after %s",
  async (name) => {
    const origin = placeButtonOnPage();
    await offerUndo();
    origin.focus();
    page.getByRole("button", { name }).element().focus();

    await userEvent.keyboard("{Enter}");

    expect(document.activeElement).toBe(origin);
  },
);

test("returns focus to where it came from after Ctrl Z", async () => {
  const origin = placeButtonOnPage();
  await offerUndo();
  origin.focus();
  page.getByRole("button", { name: "Undo" }).element().focus();

  await userEvent.keyboard("{Control>}z{/Control}");

  expect(document.activeElement).toBe(origin);
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
  const { offer, timesUndone } = await offerUndo();

  vi.advanceTimersByTime(UNDO_WINDOW_MS);

  await expect.element(offer).toHaveAttribute("data-removed", "true");
  expect(timesUndone()).toBe(0);
});

test("stops offering Ctrl Z once the offer has lapsed", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { notices, timesUndone } = await offerUndo();
  vi.advanceTimersByTime(UNDO_WINDOW_MS);

  pressKey({ key: "z", code: "KeyZ", ctrlKey: true });

  expect(timesUndone()).toBe(0);
  expect(notices.undoOffer).toBeUndefined();
});

test("holds the offer while focus is on it", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { offer, undoButton } = await offerUndo();
  undoButton.element().focus();
  await expect.element(offer).toHaveAttribute("data-expanded", "true");

  vi.advanceTimersByTime(UNDO_WINDOW_MS);

  await expect.element(offer).toHaveAttribute("data-removed", "false");
});

test("replaces an earlier offer with a newer one", async () => {
  const { notices, offer, timesUndone } = await offerUndo();
  let newerUndone = 0;

  notices.offerUndo({
    title: "Removed Sample Series 08",
    undo: () => {
      newerUndone += 1;
    },
  });
  await expect.element(offer).not.toBeInTheDocument();
  await userEvent.keyboard("{Control>}z{/Control}");

  expect(newerUndone).toBe(1);
  expect(timesUndone()).toBe(0);
});
