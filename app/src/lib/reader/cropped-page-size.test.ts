import { type ComponentProps, createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { BookPage } from "#lib/ipc/bindings.ts";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode.ts";
import WithAppContext from "../../../tests/components/WithAppContext.svelte";
import PageStack from "./PageStack.svelte";
import StripStack from "./StripStack.svelte";

const CORE_SIZE = { width: 1000, height: 1500 };
const CROPPED_IMAGE = { width: 500, height: 1000 };
const RATIO_CLOSE = 0.01;
const UNREADABLE_IMAGE = "data:image/svg+xml,unreadable" as BookPage["path"];
const NOTHING = createRawSnippet(() => ({ render: () => "<span></span>" }));

const StripWithAppContext = WithAppContext<ComponentProps<typeof StripStack>>;

function croppedImage(name: string): BookPage["path"] {
  const { width, height } = CROPPED_IMAGE;
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><title>${name}</title><rect width="${String(width)}" height="${String(height)}" fill="#f4f1ea"/></svg>`,
  )}` as BookPage["path"];
}

function pageAt(path: BookPage["path"]): BookPage {
  return {
    path,
    thumbnail: "thumbnails/0" as BookPage["thumbnail"],
    size: CORE_SIZE,
  };
}

function servePagePathsAsTheyAre(): void {
  Reflect.set(window, "__TAURI_INTERNALS__", { convertFileSrc: () => "" });
}

async function firstPageRatio(): Promise<number> {
  const image = page.getByRole("img", { name: "Page 1" }).first();
  await expect.element(image).toBeInTheDocument();
  const box = image.element().parentElement?.getBoundingClientRect();
  return (box?.width ?? 0) / (box?.height ?? Number.NaN);
}

async function hasLoaded(): Promise<void> {
  await expect
    .poll(() => {
      const image = page.getByRole("img", { name: "Page 1" }).element();
      return image instanceof HTMLImageElement && image.naturalWidth > 0;
    })
    .toBe(true);
}

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

test("sizes a page turned one at a time by its own image once another page takes its place", async () => {
  servePagePathsAsTheyAre();
  const props: ComponentProps<typeof PageStack> = {
    pages: [pageAt(croppedImage("turned"))],
    crop: "borders",
    shown: 0,
    spread: [0],
    fit: "screen",
    zoom: 1,
    isReversed: false,
    overlay: NOTHING,
    bookTitle: "Sample",
    isBlank: false,
    slide: 0,
    isSettling: false,
    startAt: undefined,
    onNextPage: () => {},
    onShownReady: () => {},
  };
  const screen = await render(PageStack, props);
  await hasLoaded();
  await expect
    .poll(firstPageRatio)
    .toBeCloseTo(CROPPED_IMAGE.width / CROPPED_IMAGE.height);

  await screen.rerender({ pages: [pageAt(UNREADABLE_IMAGE)] });

  await expect
    .poll(async () =>
      Math.abs((await firstPageRatio()) - CORE_SIZE.width / CORE_SIZE.height),
    )
    .toBeLessThan(RATIO_CLOSE);
});

test("sizes a page in the long strip by its own image once another page takes its place", async () => {
  servePagePathsAsTheyAre();
  const props: ComponentProps<typeof StripStack> = {
    pages: [pageAt(croppedImage("strip"))],
    crop: "sideBorders",
    shown: 0,
    isBlank: false,
    marks: [],
    overlay: NOTHING,
    startAt: undefined,
    onShown: () => {},
    onShownReady: () => {},
  };
  const screen = await render(StripWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: StripStack,
    pageProps: props,
  });
  await hasLoaded();
  await expect
    .poll(firstPageRatio)
    .toBeCloseTo(CROPPED_IMAGE.width / CROPPED_IMAGE.height);

  await screen.rerender({
    pageProps: { ...props, pages: [pageAt(UNREADABLE_IMAGE)] },
  });

  await expect
    .poll(async () =>
      Math.abs((await firstPageRatio()) - CORE_SIZE.width / CORE_SIZE.height),
    )
    .toBeLessThan(RATIO_CLOSE);
});
