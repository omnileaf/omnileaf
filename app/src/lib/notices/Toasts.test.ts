import { BookOpen, CircleCheck, TriangleAlert } from "@lucide/svelte";
import { flushSync } from "svelte";
import { toast } from "svelte-sonner";
import { afterEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { Platform } from "#lib/ipc/bindings.ts";

import { clearToasts } from "../../../tests/components/clear-toasts";
import "../../app.css";

import {
  type Notice,
  type NoticeAction,
  NOTICE_WINDOW_MS,
  Notices,
} from "./notices";
import SelfDismissingToastHarness from "./SelfDismissingToastHarness.svelte";
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

const BACK_ON_PAGE: Notice = {
  tone: "plain",
  icon: BookOpen,
  title: "Back on page 12",
};

const START_OVER: NoticeAction = {
  label: "Start over",
  run: () => undefined,
};

const placed: HTMLElement[] = [];

afterEach(async () => {
  for (const element of placed.splice(0)) {
    element.remove();
  }
  delete document.documentElement.dataset.platform;
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

async function renderToastsOn(platform: Platform) {
  document.documentElement.dataset.platform = platform;
  return renderToasts(platform);
}

function middleOf(element: Element): number {
  const box = element.getBoundingClientRect();
  return box.top + box.height / 2;
}

function iconOf(toast: Locator): SVGSVGElement {
  const icon = toast.element().querySelector("svg");
  if (icon === null) {
    throw new Error("the toast has no icon");
  }
  return icon;
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

test("puts a toast away when its content dismisses it as it renders", async () => {
  const notices = await renderToasts();
  notices.present(
    SelfDismissingToastHarness,
    (handle) => ({ toast: handle }),
    "polite",
  );

  flushSync();

  expect(toast.getActiveToasts()).toEqual([]);
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

test.each<Platform>(["linux", "android"])(
  "lines a one-line toast's icon up with its title, action and dismiss on %s",
  async (platform) => {
    const notices = await renderToastsOn(platform);
    notices.show({ ...BACK_ON_PAGE, action: START_OVER });
    const toast = toastSaying(BACK_ON_PAGE.title);
    await expect.element(toast).toBeVisible();

    const icon = middleOf(iconOf(toast));

    const title = toast.getByText(BACK_ON_PAGE.title, { exact: true });
    const action = toast.getByRole("button", { name: START_OVER.label });
    const dismiss = toast.getByRole("button", { name: "Dismiss" });
    expect(icon).toBeCloseTo(middleOf(title.element()), 0);
    expect(icon).toBeCloseTo(middleOf(action.element()), 0);
    expect(icon).toBeCloseTo(middleOf(dismiss.element()), 0);
  },
);

test("lines a one-line toast's icon up with its title and dismiss when it has no action", async () => {
  const notices = await renderToastsOn("linux");
  notices.show(BACK_ON_PAGE);
  const toast = toastSaying(BACK_ON_PAGE.title);
  await expect.element(toast).toBeVisible();

  const icon = middleOf(iconOf(toast));

  const title = toast.getByText(BACK_ON_PAGE.title, { exact: true });
  const dismiss = toast.getByRole("button", { name: "Dismiss" });
  expect(icon).toBeCloseTo(middleOf(title.element()), 0);
  expect(icon).toBeCloseTo(middleOf(dismiss.element()), 0);
});

test("keeps a two-line toast's icon on its title and centres the action on its words", async () => {
  const notices = await renderToastsOn("linux");
  notices.show({ ...BACK_ON_PAGE, body: "Volume 5", action: START_OVER });
  const toast = toastSaying(BACK_ON_PAGE.title);
  await expect.element(toast).toBeVisible();

  const title = toast.getByText(BACK_ON_PAGE.title, { exact: true }).element();
  const body = toast.getByText("Volume 5", { exact: true }).element();
  const action = toast.getByRole("button", { name: START_OVER.label });

  const wordsTop = title.getBoundingClientRect().top;
  const wordsBottom = body.getBoundingClientRect().bottom;
  expect(middleOf(iconOf(toast))).toBeCloseTo(middleOf(title), 0);
  expect(middleOf(action.element())).toBeCloseTo(
    (wordsTop + wordsBottom) / 2,
    0,
  );
});
