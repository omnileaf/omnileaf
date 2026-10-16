import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import { resolvedColour } from "../../../tests/components/resolved-colour";
import NewCategoryDialog from "./NewCategoryDialog.svelte";

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;
const PLATFORMS: readonly Platform[] = ["linux", "ios", "windows"];

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const platform of PLATFORMS) {
  test(`draws the name field as the shadcn input on ${platform}`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    document.documentElement.dataset.platform = platform;
    document.documentElement.dataset.theme = "light";
    await render(NewCategoryDialog, {
      isOpen: true,
      onAdd: () => {},
      onClose: () => {},
    });

    const field = page
      .getByRole("textbox", { name: m.library_tabs_category_name() })
      .element();
    const style = getComputedStyle(field);

    expect(style.borderTopLeftRadius).toBe("8px");
    expect(style.borderTopColor).toBe(resolvedColour("--input", "color"));
    expect(style.backgroundColor).toBe(
      resolvedColour("transparent", "backgroundColor"),
    );
    expect(style.boxShadow).toContain("0px 1px 2px 0px");
  });
}
