import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import DetailUndoToast from "./DetailUndoToast.svelte";

const UNDO_ICON = '[role="status"] .lucide-undo-2';

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

test("keeps an icon before the words in the page", async () => {
  await render(DetailUndoToast, {
    props: {
      offer: { title: "Details changed", undo: () => undefined },
      onDone: () => undefined,
    },
  });

  await expect
    .element(page.getByRole("status").getByText("Details changed"))
    .toBeVisible();
  expect(document.querySelectorAll(UNDO_ICON)).toHaveLength(1);
});

test("draws no icon before the words in the notice over a sheet's bar", async () => {
  await render(DetailUndoToast, {
    props: {
      offer: { title: "Details changed", undo: () => undefined },
      isOverBar: true,
      onDone: () => undefined,
    },
  });

  await expect
    .element(page.getByRole("status").getByText("Details changed"))
    .toBeVisible();
  expect(document.querySelectorAll(UNDO_ICON)).toHaveLength(0);
});
