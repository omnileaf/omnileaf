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

const PAGE_12: Notice = {
  tone: "plain",
  icon: BookOpen,
  title: "Page 12",
};

const LONG_TITLE = "Back on page 12 of 48";

const WIDE_FALLBACK_FONT = '"DejaVu Sans", "Verdana", serif';

const IOS_SHEET_CORNER = 14;

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

const START_OVER: NoticeAction = {
  label: "Start over",
  run: () => undefined,
};

const placed: HTMLElement[] = [];

afterEach(async () => {
  await page.viewport(PHONE.width, PHONE.height);
  for (const element of placed.splice(0)) {
    element.remove();
  }
  delete document.documentElement.dataset.platform;
  document.documentElement.style.removeProperty("--platform-font");
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

function tokenColour(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

function colourOf(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

function cardOf(toast: Locator): Element {
  const card = toast.element().querySelector(":scope > div");
  if (card === null) {
    throw new Error("the toast has no card");
  }
  return card;
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

test("puts a warning's action on its own row under its words", async () => {
  const notices = await renderToasts();
  notices.show({
    ...UNAVAILABLE,
    action: { label: "Free up space", run: () => undefined },
  });

  const action = page.getByRole("button", { name: "Free up space" });
  await expect.element(action).toBeVisible();

  const words = toastSaying(UNAVAILABLE.title).getByText(
    "Your progress is safe.",
  );
  expect(action.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(
    words.element().getBoundingClientRect().bottom,
  );
});

test("keeps a plain notice's action beside its words", async () => {
  const notices = await renderToasts();
  notices.show({
    ...READY,
    action: { label: "Turn off", run: () => undefined },
  });

  const action = page.getByRole("button", { name: "Turn off" });
  await expect.element(action).toBeVisible();

  const words = toastSaying(READY.title).getByText(
    "Every comic in it can be read now.",
  );
  expect(action.element().getBoundingClientRect().top).toBeLessThan(
    words.element().getBoundingClientRect().bottom,
  );
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

test.each<{ platform: Platform; size: typeof PHONE; screen: string }>([
  { platform: "linux", size: PHONE, screen: "narrow window" },
  { platform: "ios", size: PHONE, screen: "phone" },
  { platform: "android", size: TABLET, screen: "tablet" },
])(
  "lines a one-line toast's icon up with its title, action and dismiss on a $platform $screen",
  async ({ platform, size }) => {
    await page.viewport(size.width, size.height);
    const notices = await renderToastsOn(platform);
    notices.show({ ...PAGE_12, action: START_OVER });
    const toast = toastSaying(PAGE_12.title);
    await expect.element(toast).toBeVisible();

    const icon = middleOf(iconOf(toast));

    const title = toast.getByText(PAGE_12.title, { exact: true });
    const action = toast.getByRole("button", { name: START_OVER.label });
    const dismiss = toast.getByRole("button", { name: "Dismiss" });
    expect(icon).toBeCloseTo(middleOf(title.element()), 0);
    expect(icon).toBeCloseTo(middleOf(action.element()), 0);
    expect(icon).toBeCloseTo(middleOf(dismiss.element()), 0);
  },
);

test("lines a one-line toast's icon up with its title and dismiss when it has no action", async () => {
  const notices = await renderToastsOn("linux");
  notices.show(PAGE_12);
  const toast = toastSaying(PAGE_12.title);
  await expect.element(toast).toBeVisible();

  const icon = middleOf(iconOf(toast));

  const title = toast.getByText(PAGE_12.title, { exact: true });
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

test("sets a plain toast in 14px type with its body muted and a 24px action on a desktop", async () => {
  const notices = await renderToastsOn("linux");
  notices.show({ ...BACK_ON_PAGE, body: "Volume 5", action: START_OVER });
  const toast = toastSaying(BACK_ON_PAGE.title);
  await expect.element(toast).toBeVisible();

  const title = toast.getByText(BACK_ON_PAGE.title, { exact: true }).element();
  const body = toast.getByText("Volume 5", { exact: true }).element();
  const action = toast
    .getByRole("button", { name: START_OVER.label })
    .element();
  const titleStyle = getComputedStyle(title);
  const bodyStyle = getComputedStyle(body);
  const actionStyle = getComputedStyle(action);

  expect({
    title: [titleStyle.fontSize, titleStyle.fontWeight],
    body: [bodyStyle.fontSize, bodyStyle.color],
    action: [
      action.getBoundingClientRect().height,
      actionStyle.borderTopLeftRadius,
      actionStyle.fontSize,
      actionStyle.fontWeight,
      actionStyle.backgroundColor,
    ],
  }).toEqual({
    title: ["14px", "500"],
    body: ["14px", tokenColour("--muted-foreground")],
    action: [24, "4px", "12px", "500", tokenColour("--primary")],
  });
});

function cornerOf(element: Element): number {
  return Number.parseFloat(getComputedStyle(element).borderTopLeftRadius);
}

test.each<{ platform: Platform; corner: number }>([
  { platform: "linux", corner: 8 },
  { platform: "macos", corner: 10 },
  { platform: "windows", corner: 8 },
])(
  "rounds a toast's corners by $corner px on $platform",
  async ({ platform, corner }) => {
    const notices = await renderToastsOn(platform);
    notices.show(READY);
    const toast = toastSaying(READY.title);
    await expect.element(toast).toBeVisible();

    const card = cardOf(toast);

    expect(cornerOf(card)).toBe(corner);
  },
);

function typeOf(element: Element): string[] {
  const style = getComputedStyle(element);
  return [
    style.fontSize,
    style.lineHeight,
    style.fontWeight,
    style.letterSpacing,
  ];
}

test("draws a one-line toast on an iOS phone as a 48 tall glass capsule rounded by half its height with a 36 tall raised action", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  const notices = await renderToastsOn("ios");
  notices.show({ ...PAGE_12, action: START_OVER });
  const toast = toastSaying(PAGE_12.title);
  await expect.element(toast).toBeVisible();

  const card = cardOf(toast);
  const title = toast.getByText(PAGE_12.title, { exact: true }).element();
  const action = toast
    .getByRole("button", { name: START_OVER.label })
    .element();

  expect(getComputedStyle(card).backgroundColor).toBe(
    "rgba(246, 246, 246, 0.73)",
  );
  expect(getComputedStyle(card).backdropFilter).toContain("blur(");
  expect(getComputedStyle(card).borderTopWidth).toBe("0px");
  expect(card.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(getComputedStyle(card).borderTopLeftRadius).toBe("24px");
  expect(getComputedStyle(title).color).toBe("rgb(0, 0, 0)");
  expect(typeOf(title)).toEqual(["15px", "20px", "590", "-0.23px"]);
  expect(action.getBoundingClientRect().height).toBeCloseTo(36, 0);
  expect(getComputedStyle(action).backgroundColor).toBe("rgb(255, 255, 255)");
  expect(getComputedStyle(action).color).toBe("rgb(47, 111, 79)");
  expect(typeOf(action)).toEqual(["15px", "20px", "590", "-0.23px"]);
});

test("rounds an iOS phone toast whose title wraps as a card as tall as one with a second line, its icon on the first line", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.style.setProperty(
    "--platform-font",
    WIDE_FALLBACK_FONT,
  );
  const notices = await renderToastsOn("ios");
  notices.show({ ...BACK_ON_PAGE, title: LONG_TITLE, action: START_OVER });
  const toast = toastSaying(LONG_TITLE);
  await expect.element(toast).toBeVisible();

  const card = cardOf(toast);
  const title = toast.getByText(LONG_TITLE, { exact: true }).element();
  const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
  const firstLineMiddle = title.getBoundingClientRect().top + lineHeight / 2;

  expect(title.getBoundingClientRect().height).toBeCloseTo(2 * lineHeight, 0);
  expect(getComputedStyle(card).borderTopLeftRadius).toBe("24px");
  expect(card.getBoundingClientRect().height).toBeCloseTo(60, 0);
  expect(middleOf(iconOf(toast))).toBeCloseTo(firstLineMiddle, 0);
});

test("rounds an iOS phone toast with a second line to the grouped card's corner", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  const notices = await renderToastsOn("ios");
  notices.show(UNAVAILABLE);
  const toast = toastSaying(UNAVAILABLE.title);
  await expect.element(toast).toBeVisible();

  const card = cardOf(toast);
  const body = toast
    .getByText(UNAVAILABLE.body ?? "", { exact: true })
    .element();

  expect(getComputedStyle(card).backgroundColor).toBe(
    "rgba(246, 246, 246, 0.73)",
  );
  expect(getComputedStyle(card).borderTopLeftRadius).toBe("26px");
  expect(getComputedStyle(body).color).toBe("rgb(0, 0, 0)");
  expect(typeOf(body)).toEqual(["13px", "18px", "400", "-0.08px"]);
});

test("draws a toast on an Android phone as Material 3's snackbar, inverse with no icon and a 40 tall text action", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  const notices = await renderToastsOn("android");
  notices.show({ ...READY, action: START_OVER });
  const toast = toastSaying(READY.title);
  await expect.element(toast).toBeVisible();

  const card = cardOf(toast);
  const title = toast.getByText(READY.title, { exact: true }).element();
  const body = toast.getByText(READY.body ?? "", { exact: true }).element();
  const action = toast
    .getByRole("button", { name: START_OVER.label })
    .element();

  expect(getComputedStyle(card).backgroundColor).toBe("rgb(11, 15, 12)");
  expect(getComputedStyle(card).borderTopLeftRadius).toBe("4px");
  expect(card.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
  expect(iconOf(toast).getBoundingClientRect().width).toBe(0);
  expect(getComputedStyle(title).color).toBe("rgb(154, 158, 153)");
  expect(typeOf(title)).toEqual(["14px", "20px", "400", "0.25px"]);
  expect(getComputedStyle(body).color).toBe("rgb(154, 158, 153)");
  expect(action.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(getComputedStyle(action).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(action).color).toBe("rgb(188, 249, 211)");
  expect(typeOf(action)).toEqual(["14px", "20px", "500", "0.1px"]);
});

test("draws a warning on an Android phone as the same snackbar with its action under the words", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  const notices = await renderToastsOn("android");
  notices.show({ ...UNAVAILABLE, action: START_OVER });
  const toast = toastSaying(UNAVAILABLE.title);
  await expect.element(toast).toBeVisible();

  const card = getComputedStyle(cardOf(toast));
  const action = toast
    .getByRole("button", { name: START_OVER.label })
    .element();

  expect(card.backgroundColor).toBe("rgb(11, 15, 12)");
  expect(action.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(getComputedStyle(action).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(action).color).toBe("rgb(188, 249, 211)");
});

test("keeps a toast's shared look on a Linux window as narrow as a phone", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  const notices = await renderToastsOn("linux");
  notices.show(READY);
  const toast = toastSaying(READY.title);
  await expect.element(toast).toBeVisible();

  const card = getComputedStyle(cardOf(toast));

  expect(card.backgroundColor).toBe(colourOf("--card"));
  expect(card.backdropFilter).toBe("none");
});

test("draws a toast on an iOS tablet as a pill", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  const notices = await renderToastsOn("ios");
  notices.show(BACK_ON_PAGE);
  const toast = toastSaying(BACK_ON_PAGE.title);
  await expect.element(toast).toBeVisible();

  const card = cardOf(toast);

  expect(getComputedStyle(card).backgroundColor).toBe(colourOf("--card"));
  expect(cornerOf(card)).toBeGreaterThanOrEqual(
    card.getBoundingClientRect().height / 2,
  );
});

test("rounds a warning toast on an iOS tablet like a sheet rather than a pill", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  const notices = await renderToastsOn("ios");
  notices.show(UNAVAILABLE);
  const toast = toastSaying(UNAVAILABLE.title);
  await expect.element(toast).toBeVisible();

  const card = cardOf(toast);

  expect(cornerOf(card)).toBe(IOS_SHEET_CORNER);
});

test("sets a plain toast on an Android tablet in 14px type with a 48px semibold action", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  const notices = await renderToastsOn("android");
  notices.show({ ...BACK_ON_PAGE, action: START_OVER });
  const toast = toastSaying(BACK_ON_PAGE.title);
  await expect.element(toast).toBeVisible();

  const title = toast.getByText(BACK_ON_PAGE.title, { exact: true }).element();
  const action = toast
    .getByRole("button", { name: START_OVER.label })
    .element();
  const titleStyle = getComputedStyle(title);
  const actionStyle = getComputedStyle(action);

  expect({
    title: [titleStyle.fontSize, titleStyle.fontWeight],
    action: [
      action.getBoundingClientRect().height,
      actionStyle.fontSize,
      actionStyle.fontWeight,
    ],
  }).toEqual({
    title: ["14px", "500"],
    action: [48, "14px", "600"],
  });
});

test("draws a plain toast on an Android tablet inverse at 4px corners with a quieter body and action", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  const notices = await renderToastsOn("android");
  notices.show({ ...READY, action: START_OVER });
  const toast = toastSaying(READY.title);
  await expect.element(toast).toBeVisible();

  const card = getComputedStyle(cardOf(toast));
  const title = getComputedStyle(
    toast.getByText(READY.title, { exact: true }).element(),
  );
  const body = getComputedStyle(
    toast.getByText("Every comic in it can be read now.").element(),
  );
  const action = getComputedStyle(
    toast.getByRole("button", { name: START_OVER.label }).element(),
  );

  expect(card.backgroundColor).toBe(colourOf("--foreground"));
  expect(card.borderTopColor).toBe("rgba(0, 0, 0, 0)");
  expect(card.borderTopLeftRadius).toBe("4px");
  expect(title.color).toBe(colourOf("--background"));
  expect(body.color).toBe(colourOf("--color-snackbar-muted"));
  expect(body.opacity).toBe("1");
  expect(action.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(action.color).toBe(colourOf("--android-inverse-primary"));
  expect(action.fontWeight).toBe("600");
});

test("keeps a warning's own colours and filled action on an Android tablet, at the snackbar's 4px corners", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  const notices = await renderToastsOn("android");
  notices.show({ ...UNAVAILABLE, action: START_OVER });
  const toast = toastSaying(UNAVAILABLE.title);
  await expect.element(toast).toBeVisible();

  const card = getComputedStyle(cardOf(toast));
  const action = getComputedStyle(
    toast.getByRole("button", { name: START_OVER.label }).element(),
  );

  expect(card.backgroundColor).toBe(colourOf("--color-warning-soft"));
  expect(card.borderTopLeftRadius).toBe("4px");
  expect(action.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("draws a plain notice's icon on an Android tablet in the snackbar's inverse primary", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  const notices = await renderToastsOn("android");
  notices.show(READY);
  const toast = toastSaying(READY.title);
  await expect.element(toast).toBeVisible();

  const icon = getComputedStyle(iconOf(toast));

  expect(icon.color).toBe(colourOf("--android-inverse-primary"));
});

test("draws the undo icon on an Android tablet in the snackbar's muted ink", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  const notices = await renderToastsOn("android");
  notices.offerUndo({ title: "Letters deleted", undo: () => undefined });
  const toast = toastSaying("Letters deleted");
  await expect.element(toast).toBeVisible();

  const icon = getComputedStyle(iconOf(toast));

  expect(icon.color).toBe(colourOf("--color-snackbar-muted"));
});
