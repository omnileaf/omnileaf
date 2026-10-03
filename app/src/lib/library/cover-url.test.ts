import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { commands } from "$lib/ipc/bindings";

import { type CoverPath, coverUrl } from "./cover-url";

const PATH = "thumb/v1/0190a3e4-0000-8000-8000-000000000001/7/2";

afterEach(() => {
  clearMocks();
});

/** A cover path as only the backend hands one out. */
async function listedCover(): Promise<CoverPath> {
  mockIPC(() => ({
    series: [{ title: "Sample Series 01", bookCount: 1, cover: PATH }],
    next: null,
  }));
  const page = await commands.librarySeries(null);
  const cover = page.status === "ok" ? page.data.series[0]?.cover : undefined;
  if (cover === undefined || cover === null) {
    throw new Error("the backend listed no cover");
  }
  return cover;
}

test("keeps the cover path's slashes after the omni scheme's base", async () => {
  const cover = await listedCover();
  mockConvertFileSrc("linux");

  const url = coverUrl(cover);

  expect(url).toBe(`omni://localhost/${PATH}`);
});

test("uses the localhost spelling of the scheme where the webview needs one", async () => {
  const cover = await listedCover();
  mockConvertFileSrc("windows");

  const url = coverUrl(cover);

  expect(url).toBe(`http://omni.localhost/${PATH}`);
});
