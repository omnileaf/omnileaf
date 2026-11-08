import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { BookPlace, OpenedBook } from "#lib/ipc/bindings.ts";
import { Notices } from "#lib/notices/notices.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { seriesIdIn } from "#lib/series/series-id.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import BookProblem from "./BookProblem.svelte";
import DamagedBook from "./DamagedBook.svelte";
import { bookIdIn } from "./opened-book.ts";
import UnsupportedBook from "./UnsupportedBook.svelte";

const BOOK = bookIdIn("0190a3e4-0000-8000-8000-0000000000b6");
const SERIES = seriesIdIn("0190a3e4-0000-8000-8000-0000000000a4");
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 900, height: 800 };

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

function place(): BookPlace {
  if (BOOK === undefined || SERIES === undefined) {
    throw new Error("the sample ids have no id's shape");
  }
  return {
    id: BOOK,
    title: "Volume 6",
    series: SERIES,
    seriesTitle: "Sample Series 04",
    isInLibrary: true,
  };
}

function damagedBook(): OpenedBook {
  return {
    ...place(),
    pages: [],
    startPage: 0,
    reading: { state: "notStarted" },
    position: 6,
    previous: null,
    next: null,
    readingDirection: null,
    bookmarkedPages: null,
    damage: { promisedPages: 186, cause: "archiveEndsEarly" },
    secondsPerPage: null,
  };
}

async function onAndroid(size = PHONE): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform("android");
  document.documentElement.dataset.theme = "dark";
  await page.viewport(size.width, size.height);
}

async function damaged(onShowFile?: () => void) {
  const book = damagedBook();
  if (book.damage === null) {
    throw new Error("the sample book is not damaged");
  }
  return render(DamagedBook, {
    book,
    damage: book.damage,
    platform: "android",
    onRead: () => undefined,
    onShowFile,
  });
}

async function unsupported() {
  return render(UnsupportedBook, {
    place: place(),
    file: { name: "Volume 6.cbr", fileType: "cbr" },
    platform: "android",
    hideFilesLike: () => Promise.resolve({ status: "ok", data: "cbr" }),
    showFileType: () => Promise.resolve({ status: "ok", data: null }),
    notices: new Notices(),
  });
}

function metricsOf(element: Element): readonly string[] {
  const style = getComputedStyle(element);
  return [style.fontSize, style.lineHeight, style.fontWeight];
}

function sizeOf(element: Element): readonly number[] {
  const box = element.getBoundingClientRect();
  return [box.width, box.height];
}

test("sets a damaged book's title as Android's 24px regular headline", async () => {
  await onAndroid();
  const screen = await damaged();

  const title = screen.getByRole("heading", { level: 1 }).element();

  expect(metricsOf(title)).toEqual(["24px", "32px", "400"]);
});

test("sets an unsupported file's title as Android's 24px regular headline", async () => {
  await onAndroid();
  const screen = await unsupported();

  const title = screen.getByRole("heading", { level: 1 }).element();

  expect(metricsOf(title)).toEqual(["24px", "32px", "400"]);
});

test("rings a problem's icon in a 56px circle", async () => {
  await onAndroid();
  const screen = await unsupported();

  const title = screen.getByRole("heading", { level: 1 }).element();
  const media = title.parentElement?.querySelector("[data-slot=empty-media]");
  const icon = media?.querySelector("svg");

  if (
    media === undefined ||
    media === null ||
    icon === null ||
    icon === undefined
  ) {
    throw new Error("the problem drew no icon circle");
  }
  expect(sizeOf(media)).toEqual([56, 56]);
  expect(sizeOf(icon)).toEqual([28, 28]);
});

test("names the series in the top bar's 22px title beside the back arrow", async () => {
  await onAndroid();
  const screen = await unsupported();

  const series = screen.getByText("Sample Series 04").first().element();

  expect(metricsOf(series)).toEqual(["22px", "28px", "400"]);
  expect(getComputedStyle(series).color).toBe(
    resolvedColour("--foreground", "color"),
  );
});

test("keeps the series name at the breadcrumb's size on an Android tablet", async () => {
  await onAndroid(TABLET);
  const screen = await unsupported();

  const series = screen.getByText("Sample Series 04").first().element();

  expect(getComputedStyle(series).fontSize).toBe("14px");
});

test("draws a damaged book's notice on the warning fill", async () => {
  await onAndroid();
  await damaged();

  const notice = page.getByRole("alert").element();

  expect(getComputedStyle(notice).backgroundColor).toBe(
    resolvedColour("--warning-soft", "backgroundColor"),
  );
});

test("draws the file types as 32px outlined chips on Android", async () => {
  await onAndroid();
  const screen = await unsupported();

  const chip = screen.getByText("CBZ").element();

  expect(chip.getBoundingClientRect().height).toBe(32);
  expect(getComputedStyle(chip).borderTopWidth).toBe("1px");
});

test("sets the quiet actions of a problem in the muted ink", async () => {
  await onAndroid();
  const screen = await unsupported();

  const hide = screen
    .getByRole("button", { name: "Hide files like this" })
    .element();

  expect(getComputedStyle(hide).color).toBe(
    resolvedColour("--muted-foreground", "color"),
  );
});

test("sets a problem's content 16px in from the screen edge", async () => {
  await onAndroid();
  const screen = await unsupported();

  const title = screen.getByRole("heading", { level: 1 }).element();

  expect(title.getBoundingClientRect().left).toBe(16);
});

test("draws the back arrow in the foreground ink on an Android phone", async () => {
  await onAndroid();
  const screen = await unsupported();

  const back = screen.getByRole("link", { name: /^Back to / }).element();

  expect(getComputedStyle(back).color).toBe(
    resolvedColour("--foreground", "color"),
  );
});

test("keeps a problem's content inset and a damaged notice's title weight on an Android tablet", async () => {
  await onAndroid(TABLET);
  const screen = await damaged();

  const title = screen.getByRole("heading", { level: 1 }).element();
  const notice = page.getByRole("alert").element();
  const noticeTitle = notice.querySelector("[data-slot=alert-title]");
  const inset = title.closest("section")?.parentElement;

  if (noticeTitle === null || inset === null || inset === undefined) {
    throw new Error("the damaged book drew no notice title or content inset");
  }
  expect(getComputedStyle(inset).paddingInlineStart).toBe("24px");
  expect(getComputedStyle(noticeTitle).fontWeight).toBe("600");
});

test("sets a missing book's headline and circle as an Android phone's", async () => {
  await onAndroid();
  const screen = await render(BookProblem, {
    kind: "missing",
    place: place(),
    platform: "android",
    onShowFile: () => undefined,
  });

  const title = screen.getByRole("heading", { level: 1 }).element();
  const media = title.parentElement?.querySelector("[data-slot=empty-media]");

  if (media === undefined || media === null) {
    throw new Error("the problem drew no icon circle");
  }
  expect(metricsOf(title)).toEqual(["24px", "32px", "400"]);
  expect(sizeOf(media)).toEqual([56, 56]);
});

test("shows a damaged book's file from its Show the file button", async () => {
  await onAndroid();
  const onShowFile = vi.fn();
  const screen = await damaged(onShowFile);

  await screen.getByRole("button", { name: "Show the file" }).click();

  expect(onShowFile).toHaveBeenCalledOnce();
});

test("leaves a damaged book's Show the file out when its file has no library folder", async () => {
  await onAndroid();
  const screen = await damaged(undefined);

  expect(screen.getByText("Show the file").elements()).toHaveLength(0);
});

test("shows an unreadable book's file from its Show the file button", async () => {
  await onAndroid();
  const onShowFile = vi.fn();
  const screen = await render(BookProblem, {
    kind: "unreadable",
    place: place(),
    platform: "android",
    onShowFile,
  });

  await screen.getByRole("button", { name: "Show the file" }).click();

  expect(onShowFile).toHaveBeenCalledExactlyOnceWith(BOOK);
});

test("leaves an unreadable book's Show the file out when it was opened from outside the library", async () => {
  await onAndroid();
  const screen = await render(BookProblem, {
    kind: "unreadable",
    place: null,
    platform: "android",
    onShowFile: () => undefined,
  });

  expect(screen.getByText("Show the file").elements()).toHaveLength(0);
});
