import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { IpcErrorCode } from "$lib/ipc/bindings";

import AboutFailures from "./AboutFailures.svelte";
import CopyVersionButton from "./CopyVersionButton.svelte";
import { LinkOpening } from "./link-opening.svelte";
import {
  COPIED_FOR_MS,
  type CopyDetails,
  DetailsCopying,
} from "$lib/copying/details-copying.svelte";

type CopyResult = Awaited<ReturnType<CopyDetails>>;

const COPIED: CopyResult = { status: "ok", data: null };

function failed(code: IpcErrorCode): CopyResult {
  return { status: "error", error: { code, message: "from the backend" } };
}

async function renderWith(...results: (CopyResult | Promise<CopyResult>)[]) {
  const copies = { count: 0 };
  const copying = new DetailsCopying(() => {
    copies.count += 1;
    const result = results.shift();
    if (result === undefined) {
      throw new Error("copied more often than the test expects");
    }
    return Promise.resolve(result);
  });
  const opening = new LinkOpening(() => Promise.resolve(COPIED));
  await render(CopyVersionButton, { copying, look: "pane" });
  await render(AboutFailures, { copying, opening });
  return {
    copies,
    button: page.getByRole("button").element(),
    status: page.getByRole("status").element(),
    alert: page.getByRole("alert").element(),
  };
}

async function press(button: Element): Promise<void> {
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

test("copies the version details through the backend", async () => {
  const { button, copies } = await renderWith(COPIED);

  await press(button);

  expect(button).toHaveTextContent("Copied");
  expect(copies.count).toBe(1);
});

test("announces that the version details were copied", async () => {
  const { button, status } = await renderWith(COPIED);

  await press(button);

  expect(status).toHaveTextContent("Version details copied.");
});

test("offers the copy again after a moment", async () => {
  const { button, status } = await renderWith(COPIED);
  await press(button);

  await vi.advanceTimersByTimeAsync(COPIED_FOR_MS);

  expect(button).toHaveTextContent("Copy version details");
  expect(status).toBeEmptyDOMElement();
});

test("keeps the confirmation for the whole moment after a second copy", async () => {
  const { button } = await renderWith(COPIED, COPIED);
  await press(button);
  await vi.advanceTimersByTimeAsync(COPIED_FOR_MS / 2);
  await press(button);

  await vi.advanceTimersByTimeAsync(COPIED_FOR_MS / 2);

  expect(button).toHaveTextContent("Copied");
});

test("says the version details could not be copied", async () => {
  const { button, alert } = await renderWith(failed("clipboardUnavailable"));

  await press(button);

  expect(alert).toHaveTextContent(
    "Couldn't copy the version details. Try again.",
  );
  expect(button).toHaveTextContent("Copy version details");
});

test("clears the failure once a later copy works", async () => {
  const { button, alert } = await renderWith(
    failed("clipboardUnavailable"),
    COPIED,
  );
  await press(button);
  expect(alert.textContent.trim()).not.toBe("");

  await press(button);

  expect(alert.textContent.trim()).toBe("");
});

test("takes the failure down while it tries again, so a repeat is announced", async () => {
  const retry = Promise.withResolvers<CopyResult>();
  const { button, alert } = await renderWith(
    failed("clipboardUnavailable"),
    retry.promise,
  );
  await press(button);

  await press(button);

  expect(alert.textContent.trim()).toBe("");
});
