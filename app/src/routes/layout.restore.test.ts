import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { load } from "./+layout";
import {
  LIBRARY,
  OPENABLE_LIBRARY,
  openingAt,
  SAVED_PAGE,
  serveAndroidRebuiltOn,
} from "./layout-fixture";

afterEach(() => {
  clearMocks();
});

test("hands the layout the page Android saved", async () => {
  serveAndroidRebuiltOn(SAVED_PAGE, OPENABLE_LIBRARY);

  const loaded = await load(openingAt(LIBRARY));

  expect(loaded).toHaveProperty("pageToRestore", SAVED_PAGE);
});
