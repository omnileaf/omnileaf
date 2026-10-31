import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { drawnContrast } from "../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../tests/components/resolved-colour";

import type { SeriesBook } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import ContinueLink from "./ContinueLink.svelte";

const BOOK_ID = "0190a3e4-0000-8000-8000-0000000000b1" as SeriesBook["id"];
const MIN_TEXT_CONTRAST = 4.5;

const BOOK: SeriesBook = {
  id: BOOK_ID,
  position: 1,
  title: "Volume 1",
  cover: null,
  addedAtMs: 0,
  reading: { state: "notStarted" },
  pageCount: 180,
  isBookmarked: false,
  isNew: false,
  isFileMissing: false,
  kind: null,
  numbers: null,
  volume: null,
  section: "volumes",
};

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function continueLink(
  platform: "windows" | "linux",
  theme: "light" | "dark",
): Promise<HTMLElement> {
  await page.viewport(1280, 800);
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  await render(ContinueLink, { book: BOOK });
  const link = page.getByRole("link").element();
  if (!(link instanceof HTMLElement)) {
    throw new Error("Continue drew no element");
  }
  return link;
}

test.each(["light", "dark"] as const)(
  "draws Continue as Windows's accent button in the %s theme",
  async (theme) => {
    const link = await continueLink("windows", theme);
    const style = getComputedStyle(link);

    expect({
      height: link.getBoundingClientRect().height,
      radius: style.borderTopLeftRadius,
      fill: style.backgroundColor,
      size: style.fontSize,
    }).toEqual({
      height: 32,
      radius: "4px",
      fill: resolvedColour("--color-native-button-primary", "backgroundColor"),
      size: "14px",
    });
    expect(drawnContrast(link)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  },
);

test("keeps Continue as it was on Linux", async () => {
  const link = await continueLink("linux", "light");

  expect(link.getBoundingClientRect().height).toBeGreaterThan(32);
  expect(getComputedStyle(link).borderTopLeftRadius).not.toBe("4px");
});
