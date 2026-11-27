import { type ComponentProps, createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { BookPage } from "#lib/ipc/bindings.ts";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode.ts";
import WithAppContext from "../../../tests/components/WithAppContext.svelte";
import { PAGES_LOADING_AT_ONCE } from "./page-requests";
import StripStack from "./StripStack.svelte";

const PAGE_COUNT = 8;
const PAGES_KEPT_AT_THE_START = 4;
const NOTHING = createRawSnippet(() => ({ render: () => "<span></span>" }));

const StripWithAppContext = WithAppContext<ComponentProps<typeof StripStack>>;

function pageAt(index: number): BookPage {
  return {
    path: `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="2400"><title>${String(index)}</title></svg>`,
    )}` as BookPage["path"],
    thumbnail: "thumbnails/0" as BookPage["thumbnail"],
    size: { width: 800, height: 2400 },
  };
}

function pageImages(): HTMLImageElement[] {
  return [...document.querySelectorAll<HTMLImageElement>("[data-strip] img")];
}

function imagesAsked(): number {
  return pageImages().filter((image) => image.hasAttribute("src")).length;
}

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

test("asks again a few pages at a time once blank pages are turned off", async () => {
  Reflect.set(window, "__TAURI_INTERNALS__", { convertFileSrc: () => "" });
  const props: ComponentProps<typeof StripStack> = {
    pages: Array.from({ length: PAGE_COUNT }, (_, index) => pageAt(index)),
    crop: "whole",
    shown: 0,
    isBlank: false,
    marks: [],
    overlay: NOTHING,
    isSliderHeld: false,
    startAt: undefined,
    onShown: () => {},
    onShownReady: () => {},
  };
  const screen = await render(StripWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: StripStack,
    pageProps: props,
  });
  await expect
    .poll(
      () =>
        pageImages().filter((image) => image.naturalWidth > 0).length >=
        PAGES_KEPT_AT_THE_START,
    )
    .toBe(true);

  await screen.rerender({ pageProps: { ...props, isBlank: true } });
  await screen.rerender({ pageProps: { ...props, isBlank: false } });

  expect(imagesAsked()).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
});
