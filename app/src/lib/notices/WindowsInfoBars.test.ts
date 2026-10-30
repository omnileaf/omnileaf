import { CircleCheck, TriangleAlert } from "@lucide/svelte";
import { toast } from "svelte-sonner";
import { afterEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import { followCorePlatform } from "#lib/page/platform.ts";

import { clearToasts } from "../../../tests/components/clear-toasts";
import { resolvedColour } from "../../../tests/components/resolved-colour";
import "../../app.css";

import type { InfoBarSeverity } from "./info-bar-severity";
import {
  type Notice,
  type NoticeAction,
  NOTICE_WINDOW_MS,
  Notices,
} from "./notices";
import { holdsPageNotices } from "./page-notice-slot.svelte";
import Toasts from "./Toasts.svelte";
import WindowsInfoBarHarness from "./WindowsInfoBarHarness.svelte";

const READY: Notice = {
  tone: "plain",
  icon: CircleCheck,
  title: "Sample Library is ready",
  body: "Every comic in it can be read now.",
};

const FIND_THE_FOLDER: NoticeAction = {
  label: "Find the folder",
  run: () => undefined,
};

const UNAVAILABLE: Notice = {
  tone: "warning",
  icon: TriangleAlert,
  title: "Sample Library isn't available",
  body: "Your progress is safe.",
  action: FIND_THE_FOLDER,
};

const DESKTOP = { width: 1280, height: 800 };
const NARROW = { width: 420, height: 800 };
const INFO_BAR_HEIGHT = 48;
const SPACE_UNDER_BAR = 12;
const CLOSE_SIZE = 38;
const CLOSE_INSET = 5;
const ICON_SIZE = 16;
const ACTION_TO_CLOSE = 21;
const FLOATING_TOP = 64;
const FLOATING_INSET = 8;

const FILLS = {
  informational: "--native-color-info-bar",
  success: "--native-color-info-bar-success",
  warning: "--native-color-info-bar-warning",
  error: "--native-color-info-bar-error",
} as const satisfies Record<InfoBarSeverity, string>;

const ICON_INKS = {
  informational: "--native-color-info-bar-icon",
  success: "--native-color-info-bar-success-icon",
  warning: "--native-color-info-bar-warning-icon",
  error: "--native-color-info-bar-error-icon",
} as const satisfies Record<InfoBarSeverity, string>;

const cleanups: (() => void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  await page.viewport(DESKTOP.width, DESKTOP.height);
  await clearToasts();
});

interface PageWithSlot {
  readonly slot: HTMLElement;
  readonly heading: HTMLHeadingElement;
}

function placePageWithSlot(): PageWithSlot {
  const main = document.createElement("main");
  const slot = document.createElement("div");
  const heading = document.createElement("h1");
  heading.tabIndex = -1;
  heading.textContent = "Library";
  main.append(slot, heading);
  document.body.append(main);
  const release = holdsPageNotices(slot);
  cleanups.push(() => {
    if (typeof release === "function") {
      release();
    }
    main.remove();
  });
  return { slot, heading };
}

async function renderOnWindows(): Promise<Notices> {
  await page.viewport(DESKTOP.width, DESKTOP.height);
  followCorePlatform("windows");
  const notices = new Notices();
  await render(Toasts, { notices, platform: "windows", theme: "light" });
  return notices;
}

function infoBarSaying(text: string): Locator {
  return page.getByRole("region", { name: "Notifications" }).getByText(text);
}

function barOf(text: string): HTMLElement {
  const bar = infoBarSaying(text)
    .element()
    .closest<HTMLElement>("[data-info-bar]");
  if (bar === null) {
    throw new Error(`no InfoBar says ${text}`);
  }
  return bar;
}

function surfaceOf(bar: HTMLElement): HTMLElement {
  const surface = bar.firstElementChild;
  if (!(surface instanceof HTMLElement)) {
    throw new Error("the InfoBar has no surface");
  }
  return surface;
}

test("shows a Windows notice as an InfoBar in the page's notice slot, newest first", async () => {
  const { slot } = placePageWithSlot();
  const notices = await renderOnWindows();

  notices.show(READY);
  notices.show(UNAVAILABLE);

  await expect.element(infoBarSaying(UNAVAILABLE.title)).toBeVisible();
  expect(slot.contains(barOf(READY.title))).toBe(true);
  expect(
    [...slot.querySelectorAll("[data-info-bar]")].map(
      (bar) => bar.querySelector("p")?.textContent,
    ),
  ).toEqual([UNAVAILABLE.title, READY.title]);
  expect(document.querySelector("[data-sonner-toast]")).toBeNull();
});

test("pushes the page down by the InfoBar and the space under it", async () => {
  const { heading } = placePageWithSlot();
  const notices = await renderOnWindows();
  const before = heading.getBoundingClientRect().top;

  notices.show({ tone: "plain", icon: CircleCheck, title: "Back on page 12" });

  await expect.element(infoBarSaying("Back on page 12")).toBeVisible();
  const barHeight = surfaceOf(barOf("Back on page 12")).getBoundingClientRect()
    .height;
  expect(barHeight).toBeGreaterThanOrEqual(INFO_BAR_HEIGHT);
  expect(
    getComputedStyle(surfaceOf(barOf("Back on page 12"))).borderTopLeftRadius,
  ).toBe("4px");
  expect(heading.getBoundingClientRect().top - before).toBe(
    barHeight + SPACE_UNDER_BAR,
  );
});

test("puts the action at the end of the InfoBar, just before its close button", async () => {
  placePageWithSlot();
  const notices = await renderOnWindows();
  notices.show({ ...READY, body: "Ready.", action: FIND_THE_FOLDER });

  const action = page.getByRole("button", { name: "Find the folder" });
  const close = page.getByRole("button", { name: "Dismiss" });
  await expect.element(action).toBeVisible();

  const bar = barOf(READY.title);
  const actionBox = action.element().getBoundingClientRect();
  const closeBox = close.element().getBoundingClientRect();
  const barBox = surfaceOf(bar).getBoundingClientRect();
  const words = infoBarSaying("Ready.").element().getBoundingClientRect();
  expect(
    action.element().compareDocumentPosition(close.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(actionBox.top).toBeLessThan(words.bottom);
  expect(closeBox.left - actionBox.right).toBeCloseTo(ACTION_TO_CLOSE, 0);
  expect([closeBox.width, closeBox.height]).toEqual([CLOSE_SIZE, CLOSE_SIZE]);
  expect(barBox.right - closeBox.right).toBe(CLOSE_INSET + 1);
  expect(closeBox.top - barBox.top).toBe(CLOSE_INSET + 1);
});

test("draws the action as the Windows standard button", async () => {
  placePageWithSlot();
  const notices = await renderOnWindows();
  notices.show(UNAVAILABLE);

  const action = page.getByRole("button", { name: "Find the folder" });
  await expect.element(action).toBeVisible();

  expect(getComputedStyle(action.element()).backgroundColor).toBe(
    resolvedColour("--native-color-button-secondary", "backgroundColor"),
  );
});

test("sets the title in semibold and the message in regular 14px type beside it", async () => {
  placePageWithSlot();
  const notices = await renderOnWindows();
  notices.show(READY);
  await expect.element(infoBarSaying(READY.title)).toBeVisible();

  const title = infoBarSaying(READY.title).element();
  const body = infoBarSaying(READY.body ?? "").element();
  const titleStyle = getComputedStyle(title);
  const bodyStyle = getComputedStyle(body);

  expect([titleStyle.fontSize, titleStyle.fontWeight]).toEqual(["14px", "600"]);
  expect([bodyStyle.fontSize, bodyStyle.fontWeight]).toEqual(["14px", "400"]);
  expect(body.getBoundingClientRect().top).toBe(
    title.getBoundingClientRect().top,
  );
});

test("stacks the message over its action when the InfoBar is too narrow for one line", async () => {
  placePageWithSlot();
  const notices = await renderOnWindows();
  await page.viewport(NARROW.width, NARROW.height);
  notices.show(UNAVAILABLE);

  const action = page.getByRole("button", { name: "Find the folder" });
  await expect.element(action).toBeVisible();

  const body = infoBarSaying(UNAVAILABLE.body ?? "").element();
  const title = infoBarSaying(UNAVAILABLE.title).element();
  await expect
    .poll(() =>
      barOf(UNAVAILABLE.title).firstElementChild?.hasAttribute("data-stacked"),
    )
    .toBe(true);
  expect(body.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    title.getBoundingClientRect().bottom,
  );
  expect(action.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(
    body.getBoundingClientRect().bottom,
  );
});

test("announces a warning at once and a plain notice politely in the Notifications region", async () => {
  placePageWithSlot();
  const notices = await renderOnWindows();

  notices.show(UNAVAILABLE);
  notices.show(READY);

  await expect
    .element(page.getByRole("alert").filter({ hasText: UNAVAILABLE.title }))
    .toBeVisible();
  await expect
    .element(page.getByRole("status").filter({ hasText: READY.title }))
    .toBeVisible();
  await expect
    .element(page.getByRole("region", { name: "Notifications" }))
    .toHaveAttribute("aria-live", "polite");
});

test("leaves focus where it was when an InfoBar appears", async () => {
  const { heading } = placePageWithSlot();
  const notices = await renderOnWindows();
  heading.focus();

  notices.show(UNAVAILABLE);

  await expect.element(infoBarSaying(UNAVAILABLE.title)).toBeVisible();
  expect(document.activeElement).toBe(heading);
});

test("dismisses an InfoBar from the keyboard and returns focus to where it came from", async () => {
  const { heading } = placePageWithSlot();
  const notices = await renderOnWindows();
  notices.show(UNAVAILABLE);
  const close = page.getByRole("button", { name: "Dismiss" });
  await expect.element(close).toBeVisible();
  heading.focus();
  close.element().focus();

  await userEvent.keyboard("{Enter}");

  await expect
    .element(infoBarSaying(UNAVAILABLE.title))
    .not.toBeInTheDocument();
  expect(document.activeElement).toBe(heading);
});

test("lets a plain InfoBar lapse after a few seconds and keeps a warning", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  placePageWithSlot();
  const notices = await renderOnWindows();
  notices.show(READY);
  notices.show(UNAVAILABLE);
  await expect.element(infoBarSaying(READY.title)).toBeVisible();

  vi.advanceTimersByTime(NOTICE_WINDOW_MS);

  await expect.element(infoBarSaying(READY.title)).not.toBeInTheDocument();
  await expect.element(infoBarSaying(UNAVAILABLE.title)).toBeVisible();
});

test("names the undo shortcut on its action", async () => {
  placePageWithSlot();
  const notices = await renderOnWindows();

  notices.offerUndo({ title: "Comics removed", undo: () => undefined });

  await expect
    .element(page.getByRole("button", { name: "Undo" }))
    .toHaveAttribute("aria-keyshortcuts", "Control+Z");
});

test("floats the InfoBars under the top bar when the screen has no page slot", async () => {
  const notices = await renderOnWindows();

  notices.show(READY);

  await expect.element(infoBarSaying(READY.title)).toBeVisible();
  const surface = surfaceOf(barOf(READY.title));
  const box = surface.getBoundingClientRect();
  expect(getComputedStyle(surface).borderTopLeftRadius).toBe("8px");
  expect(getComputedStyle(surface).backgroundColor).toBe(
    resolvedColour("--native-color-info-bar-floating", "backgroundColor"),
  );
  expect([box.top, box.left, DESKTOP.width - box.right]).toEqual([
    FLOATING_TOP,
    FLOATING_INSET,
    FLOATING_INSET,
  ]);
});

test.each<{ severity: InfoBarSeverity; theme: "light" | "dark" }>([
  { severity: "informational", theme: "light" },
  { severity: "success", theme: "light" },
  { severity: "warning", theme: "light" },
  { severity: "error", theme: "light" },
  { severity: "informational", theme: "dark" },
  { severity: "error", theme: "dark" },
])(
  "fills a $severity InfoBar with its tone and draws its 16px icon in the tone's ink in $theme",
  async ({ severity, theme }) => {
    followCorePlatform("windows");
    document.documentElement.dataset.theme = theme;

    await render(WindowsInfoBarHarness, { severity, title: "Marked as read" });

    const bar = page
      .getByText("Marked as read")
      .element()
      .closest("[data-severity]");
    if (!(bar instanceof HTMLElement)) {
      throw new Error("the InfoBar has no severity");
    }
    const icon = bar.querySelector("svg");
    expect(bar.dataset.severity).toBe(severity);
    expect(getComputedStyle(bar).backgroundColor).toBe(
      resolvedColour(FILLS[severity], "backgroundColor"),
    );
    expect(icon === null ? undefined : getComputedStyle(icon).color).toBe(
      resolvedColour(ICON_INKS[severity], "color"),
    );
    expect(icon?.getBoundingClientRect().width).toBe(ICON_SIZE);
  },
);

test("keeps the toast on Linux even when the page has a notice slot", async () => {
  const { slot } = placePageWithSlot();
  const notices = new Notices();
  await render(Toasts, { notices, platform: "linux", theme: "light" });

  notices.show(READY);

  await expect
    .element(
      page
        .getByRole("region", { name: "Notifications F6" })
        .getByRole("listitem")
        .filter({ hasText: READY.title }),
    )
    .toBeVisible();
  expect(slot.childElementCount).toBe(0);
});

test("keeps Windows notices out of sonner's store and forgets each one once it goes", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  placePageWithSlot();
  const notices = await renderOnWindows();
  notices.show(READY);
  notices.show(UNAVAILABLE);
  await expect.element(infoBarSaying(UNAVAILABLE.title)).toBeVisible();
  expect(toast.getActiveToasts()).toEqual([]);
  expect(notices.onScreen).toHaveLength(2);

  vi.advanceTimersByTime(NOTICE_WINDOW_MS);
  notices.withdraw(UNAVAILABLE);

  await expect
    .element(infoBarSaying(UNAVAILABLE.title))
    .not.toBeInTheDocument();
  expect(notices.onScreen).toEqual([]);
});
