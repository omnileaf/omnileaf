import { CircleCheck, TriangleAlert } from "@lucide/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { Platform } from "#lib/ipc/bindings.ts";

import { clearToasts } from "../../../tests/components/clear-toasts";
import "../../app.css";

import { type Notice, NOTICE_WINDOW_MS, Notices } from "./notices";
import Toasts from "./Toasts.svelte";

const READY: Notice = {
  tone: "plain",
  icon: CircleCheck,
  title: "Sample Library is ready",
  body: "Every comic in it can be read now.",
};

const UNAVAILABLE: Notice = {
  tone: "warning",
  icon: TriangleAlert,
  title: "Sample Library isn't available",
  body: "Your progress is safe.",
};

const placed: HTMLElement[] = [];

afterEach(async () => {
  for (const element of placed.splice(0)) {
    element.remove();
  }
  await clearToasts();
});

function placeOnPage<Tag extends "button" | "main">(
  tag: Tag,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  document.body.append(element);
  placed.push(element);
  return element;
}

function placePageHeading(): HTMLHeadingElement {
  const heading = document.createElement("h1");
  heading.tabIndex = -1;
  placeOnPage("main").append(heading);
  return heading;
}

function titled(title: string): Notice {
  return { ...READY, title };
}

function toastSaying(text: string) {
  return page.getByRole("listitem").filter({ hasText: text });
}

async function renderToasts(platform: Platform = "linux") {
  const notices = new Notices();
  await render(Toasts, { notices, platform, theme: "light" });
  return notices;
}

test("shows a notice in the notifications region", async () => {
  const notices = await renderToasts();

  notices.show(READY);

  await expect
    .element(page.getByRole("region", { name: "Notifications F6" }))
    .toHaveTextContent(
      "Sample Library is ready Every comic in it can be read now.",
    );
});

test("announces a warning at once and a plain notice politely", async () => {
  const notices = await renderToasts();

  notices.show(UNAVAILABLE);
  notices.show(READY);

  await expect
    .element(toastSaying(UNAVAILABLE.title))
    .toHaveAttribute("aria-live", "assertive");
  await expect
    .element(toastSaying(READY.title))
    .toHaveAttribute("aria-live", "polite");
});

test("stacks up to three toasts with the newest in front", async () => {
  const notices = await renderToasts();

  for (const title of ["First", "Second", "Third", "Fourth"]) {
    notices.show(titled(title));
  }

  await expect
    .element(toastSaying("Fourth"))
    .toHaveAttribute("data-front", "true");
  await expect
    .element(toastSaying("First"))
    .toHaveAttribute("data-visible", "false");
  expect(
    page
      .getByRole("listitem")
      .elements()
      .map((toast) => toast.dataset.index),
  ).toEqual(["0", "1", "2", "3"]);
  expect(
    page
      .getByRole("listitem")
      .elements()
      .map((toast) => toast.textContent.trim().split(" ")[0]),
  ).toEqual(["Fourth", "Third", "Second", "First"]);
});

test("puts a toast away when it's dismissed", async () => {
  const notices = await renderToasts();
  notices.show(UNAVAILABLE);

  await page.getByRole("button", { name: "Dismiss" }).click();

  await expect.element(toastSaying(UNAVAILABLE.title)).not.toBeInTheDocument();
});

test("runs a notice's action and puts the toast away", async () => {
  const notices = await renderToasts();
  let timesRun = 0;
  notices.show({
    ...UNAVAILABLE,
    action: {
      label: "Find the folder",
      run: () => {
        timesRun += 1;
      },
    },
  });

  await page.getByRole("button", { name: "Find the folder" }).click();

  expect(timesRun).toBe(1);
  await expect.element(toastSaying(UNAVAILABLE.title)).not.toBeInTheDocument();
});

test("returns focus to where it came from once dismissed", async () => {
  const origin = placeOnPage("button");
  const notices = await renderToasts();
  notices.show(UNAVAILABLE);
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  await expect.element(dismiss).toBeVisible();
  origin.focus();
  dismiss.element().focus();

  await userEvent.keyboard("{Enter}");

  expect(document.activeElement).toBe(origin);
});

test("returns focus to the page heading once an action runs, if where it came from has gone", async () => {
  const heading = placePageHeading();
  const origin = placeOnPage("button");
  const notices = await renderToasts();
  notices.show({
    ...UNAVAILABLE,
    action: { label: "Find the folder", run: () => undefined },
  });
  const action = page.getByRole("button", { name: "Find the folder" });
  await expect.element(action).toBeVisible();
  origin.focus();
  action.element().focus();
  origin.remove();

  await userEvent.keyboard("{Enter}");

  expect(document.activeElement).toBe(heading);
});

test("withdraws a notice still on screen and keeps the others", async () => {
  const notices = await renderToasts();
  notices.show(UNAVAILABLE);
  notices.show(READY);

  notices.withdraw(UNAVAILABLE);

  await expect.element(toastSaying(UNAVAILABLE.title)).not.toBeInTheDocument();
  await expect.element(toastSaying(READY.title)).toBeVisible();
});

test("lets a plain notice lapse after a few seconds", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const notices = await renderToasts();
  notices.show(READY);
  await expect.element(toastSaying(READY.title)).toBeVisible();

  vi.advanceTimersByTime(NOTICE_WINDOW_MS);

  await expect
    .element(toastSaying(READY.title))
    .toHaveAttribute("data-removed", "true");
});

test("keeps a warning until it's dismissed", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const notices = await renderToasts();
  notices.show(UNAVAILABLE);
  await expect.element(toastSaying(UNAVAILABLE.title)).toBeVisible();

  vi.advanceTimersByTime(NOTICE_WINDOW_MS * 10);

  await expect
    .element(toastSaying(UNAVAILABLE.title))
    .toHaveAttribute("data-removed", "false");
});

test("spreads the stack while focus is in it", async () => {
  const notices = await renderToasts();
  notices.show(titled("First"));
  notices.show(titled("Second"));
  const dismiss = page.getByRole("button", { name: "Dismiss" }).first();
  await expect.element(dismiss).toBeVisible();

  dismiss.element().focus();

  await expect
    .element(toastSaying("First"))
    .toHaveAttribute("data-expanded", "true");
});

test("holds every toast while the pointer is over the stack", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const notices = await renderToasts();
  notices.show(titled("First"));
  notices.show(titled("Second"));
  await userEvent.hover(toastSaying("Second"));
  await expect
    .element(toastSaying("First"))
    .toHaveAttribute("data-expanded", "true");

  vi.advanceTimersByTime(NOTICE_WINDOW_MS);

  await expect
    .element(toastSaying("First"))
    .toHaveAttribute("data-removed", "false");
  await expect
    .element(toastSaying("Second"))
    .toHaveAttribute("data-removed", "false");
});

test("holds every toast while focus is in the stack", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const notices = await renderToasts();
  notices.show(titled("First"));
  notices.show(titled("Second"));
  const dismiss = page.getByRole("button", { name: "Dismiss" }).first();
  await expect.element(dismiss).toBeVisible();
  dismiss.element().focus();
  await expect
    .element(toastSaying("First"))
    .toHaveAttribute("data-expanded", "true");

  vi.advanceTimersByTime(NOTICE_WINDOW_MS);

  await expect
    .element(toastSaying("First"))
    .toHaveAttribute("data-removed", "false");
});

test("starts the wait again once focus leaves the stack", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const notices = await renderToasts();
  notices.show(READY);
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  await expect.element(dismiss).toBeVisible();
  dismiss.element().focus();
  await expect
    .element(toastSaying(READY.title))
    .toHaveAttribute("data-expanded", "true");
  vi.advanceTimersByTime(NOTICE_WINDOW_MS);

  placeOnPage("button").focus();
  await expect
    .element(toastSaying(READY.title))
    .toHaveAttribute("data-expanded", "false");
  vi.advanceTimersByTime(NOTICE_WINDOW_MS);

  await expect
    .element(toastSaying(READY.title))
    .toHaveAttribute("data-removed", "true");
});
