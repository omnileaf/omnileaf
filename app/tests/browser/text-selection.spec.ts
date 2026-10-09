import type { Page } from "@playwright/test";

import { expect, selectedByDoubleClick, test } from "./fixtures.ts";

function isSelectable(
  page: Page,
  tag: string,
  attributes: Record<string, string>,
): Promise<boolean> {
  return page.evaluate(
    ([name, settings]) => {
      const element = document.createElement(name);
      for (const [attribute, value] of Object.entries(settings)) {
        element.setAttribute(attribute, value);
      }
      document.querySelector("main")?.append(element);
      return getComputedStyle(element).userSelect === "text";
    },
    [tag, attributes] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
});

test("keeps the interface's text from being selected", async ({ page }) => {
  const selected = await selectedByDoubleClick(
    page,
    page.getByRole("heading", { level: 1, name: "Library" }),
  );

  expect(selected).toBe("");
});

test("keeps links and images from being dragged out of the window", async ({
  page,
}) => {
  const link = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" });

  const linkDrag = await link.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("-webkit-user-drag"),
  );
  const imageDrag = await page.evaluate(() => {
    const image = document.createElement("img");
    document.querySelector("main")?.append(image);
    return getComputedStyle(image).getPropertyValue("-webkit-user-drag");
  });

  expect([linkDrag, imageDrag]).toEqual(["none", "none"]);
});

test("lets the text in a field be selected, but not a checkbox or a radio button", async ({
  page,
}) => {
  const selectable = {
    textField: await isSelectable(page, "input", { type: "text" }),
    textArea: await isSelectable(page, "textarea", {}),
    editable: await isSelectable(page, "div", { contenteditable: "true" }),
    notEditable: await isSelectable(page, "div", { contenteditable: "false" }),
    checkbox: await isSelectable(page, "input", { type: "checkbox" }),
    radio: await isSelectable(page, "input", { type: "radio" }),
  };

  expect(selectable).toEqual({
    textField: true,
    textArea: true,
    editable: true,
    notEditable: false,
    checkbox: false,
    radio: false,
  });
});
