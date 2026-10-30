import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { BookPlace } from "#lib/ipc/bindings.ts";
import { Notices } from "#lib/notices/notices.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { seriesIdIn } from "#lib/series/series-id.ts";

import { drawnContrast } from "../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../tests/components/resolved-colour";

import BookProblem from "./BookProblem.svelte";
import { bookIdIn } from "./opened-book.ts";
import UnsupportedBook from "./UnsupportedBook.svelte";

const BOOK = bookIdIn("0190a3e4-0000-8000-8000-0000000000b6");
const SERIES = seriesIdIn("0190a3e4-0000-8000-8000-0000000000a4");
const SUBTITLE = ["20px", "28px", "600"];

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

function onWindows(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
  followCorePlatform("windows");
}

function metricsOf(element: Element): readonly string[] {
  const style = getComputedStyle(element);
  return [style.fontSize, style.lineHeight, style.fontWeight];
}

async function unreadable() {
  return render(BookProblem, {
    kind: "unreadable",
    place: null,
    platform: "windows",
  });
}

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

async function unsupported() {
  return render(UnsupportedBook, {
    place: place(),
    file: { name: "Volume 6.cbr", fileType: "cbr" },
    platform: "windows",
    hideFilesLike: () => Promise.resolve({ status: "ok", data: "cbr" }),
    showFileType: () => Promise.resolve({ status: "ok", data: null }),
    notices: new Notices(),
  });
}

test("sets an unreadable book's title as a Subtitle with no art behind its icon on Windows", async () => {
  onWindows("light");
  const screen = await unreadable();

  const title = screen.getByRole("heading", { level: 1 }).element();
  const media = title.parentElement?.querySelector("[data-slot=empty-media]");

  expect(metricsOf(title)).toEqual(SUBTITLE);
  expect(getComputedStyle(media ?? title).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("sets an unsupported book's title as a Subtitle with no art behind its icon on Windows", async () => {
  onWindows("light");
  const screen = await unsupported();

  const title = screen.getByRole("heading", { level: 1 }).element();
  const media = title.parentElement?.querySelector("[data-slot=empty-media]");

  expect(metricsOf(title)).toEqual(SUBTITLE);
  expect(getComputedStyle(media ?? title).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("draws the way back as the accent button on Windows", async () => {
  onWindows("dark");
  const screen = await unreadable();

  const way = screen
    .getByRole("link", { name: "Back to the library" })
    .last()
    .element();
  const style = getComputedStyle(way);

  expect(style.height).toBe("32px");
  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
});

test("draws the unsupported book's actions as standard buttons on Windows", async () => {
  onWindows("dark");
  const screen = await unsupported();

  const hide = screen
    .getByRole("button", { name: "Hide files like this" })
    .element();
  const style = getComputedStyle(hide);

  expect(style.height).toBe("32px");
  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-button-secondary", "backgroundColor"),
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`reads an unreadable book's body at 4.5 to 1 in the ${theme} theme`, async () => {
    onWindows(theme);
    const screen = await unreadable();

    const body = screen.getByText("Its file may have moved", { exact: false });
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--background)";
    probe.style.color = getComputedStyle(body.element()).color;
    body.element().parentElement?.append(probe);

    expect(drawnContrast(probe)).toBeGreaterThanOrEqual(4.5);
  });
}
