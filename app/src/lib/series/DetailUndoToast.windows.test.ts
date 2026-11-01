import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import DetailUndoToast from "./DetailUndoToast.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("draws an undone detail's notice as a success InfoBar on Windows", async () => {
  followCorePlatform("windows");
  await page.viewport(1280, 800);
  await render(DetailUndoToast, {
    props: {
      offer: { title: "Details changed", undo: () => undefined },
      onDone: () => undefined,
    },
  });

  const bar = page
    .getByText("Details changed")
    .element()
    .closest("[data-severity]");

  expect(bar?.getAttribute("data-severity")).toBe("success");
});

test("leaves the dismiss button off a Windows InfoBar over a sheet's bar", async () => {
  followCorePlatform("windows");
  await page.viewport(1280, 800);
  await render(DetailUndoToast, {
    props: {
      offer: { title: "Details changed", undo: () => undefined },
      isOverBar: true,
      onDone: () => undefined,
    },
  });

  await expect.element(page.getByText("Details changed")).toBeVisible();
  expect(page.getByRole("button", { name: "Dismiss" }).query()).toBeNull();
  await expect
    .element(page.getByRole("button", { name: "Undo" }))
    .toBeVisible();
});

test("keeps the dismiss button on a Windows InfoBar in the page", async () => {
  followCorePlatform("windows");
  await page.viewport(1280, 800);
  await render(DetailUndoToast, {
    props: {
      offer: { title: "Details changed", undo: () => undefined },
      onDone: () => undefined,
    },
  });

  await expect
    .element(page.getByRole("button", { name: "Dismiss" }))
    .toBeVisible();
});
