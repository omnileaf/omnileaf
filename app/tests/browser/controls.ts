import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { onPlatform } from "./fixtures.ts";

export interface Control {
  readonly name: string;
  readonly path: string;
  readonly find: (page: Page) => Locator;
}

export const THEME_OPTION: Control = {
  name: "a theme option",
  path: "/settings/appearance",
  find: (page) => page.locator("label").filter({ hasText: "Dark" }),
};

export const CONTROLS: readonly Control[] = [
  {
    name: "a filled button",
    path: "/settings/library",
    find: (page) => addFolderBesideFolders(page),
  },
  {
    name: "an outlined button",
    path: "/",
    find: (page) => addFolderInPageHeading(page),
  },
  {
    name: "a destination in the sidebar",
    path: "/",
    find: (page) => destination(page, "Browse"),
  },
  {
    name: "a settings section beside the page",
    path: "/settings/library",
    find: (page) =>
      page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link", { name: "Appearance" }),
  },
  THEME_OPTION,
  {
    name: "a language option",
    path: "/settings/general/language",
    find: (page) => page.locator("label").last(),
  },
  {
    name: "a row in About",
    path: "/settings/about",
    find: (page) => page.getByRole("button", { name: /Source code/ }),
  },
  {
    name: "a switch row",
    path: "/settings/privacy/screenshot-mode",
    find: (page) =>
      page.getByRole("switch", { name: "Show the Screenshot mode label" }),
  },
  {
    name: "a switch on a card",
    path: "/settings/privacy/screenshot-mode",
    find: (page) =>
      page.getByRole("switch", { name: "Screenshot mode", exact: true }),
  },
];

export const DESKTOP = onPlatform("macos").backend;

export const WITH_THE_PICKER_OPEN: FakeBackend = {
  ...DESKTOP,
  addLibraryFolder: () => new Promise<never>(() => undefined),
};

export function addFolderBesideFolders(page: Page): Locator {
  return page
    .getByRole("region", { name: "Folders" })
    .getByRole("button", { name: "Add a folder" });
}

export function addFolderInPageHeading(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("button", { name: "Add a folder" })
    .first();
}

export function destination(page: Page, name: string): Locator {
  return page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name });
}
