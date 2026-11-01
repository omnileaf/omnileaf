import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import DetailUndoToast from "./DetailUndoToast.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

test("keeps the dismiss button beside Undo in the page", async () => {
  await render(DetailUndoToast, {
    props: {
      offer: { title: "Details changed", undo: () => undefined },
      onDone: () => undefined,
    },
  });

  await expect
    .element(page.getByRole("button", { name: "Dismiss" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Undo" }))
    .toBeVisible();
});

test("leaves the dismiss button off the notice over a sheet's bar", async () => {
  await render(DetailUndoToast, {
    props: {
      offer: { title: "Details changed", undo: () => undefined },
      isOverBar: true,
      onDone: () => undefined,
    },
  });

  await expect
    .element(page.getByRole("button", { name: "Undo" }))
    .toBeVisible();
  expect(page.getByRole("button", { name: "Dismiss" }).query()).toBeNull();
});
