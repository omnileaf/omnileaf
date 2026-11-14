import type { Locator, Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const NOTE_TO_ACTION = 16;

interface EmptyScreen {
  readonly name: string;
  readonly path: string;
  readonly backend: FakeBackend;
  readonly action: (page: Page) => Locator;
}

const SCREENS: readonly EmptyScreen[] = [
  {
    name: "the empty library",
    path: "/",
    backend: DEFAULT_BACKEND,
    action: (page) =>
      page
        .getByRole("region", { name: "Your library is empty" })
        .getByRole("button", { name: "Add a folder" }),
  },
  {
    name: "the library that can't be read",
    path: "/",
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => {
        throw new CommandFailure({
          code: "internal",
          message: "the library could not be read",
        });
      },
    },
    action: (page) =>
      page.getByRole("alert").getByRole("button", { name: "Try again" }),
  },
  {
    name: "History with nothing read",
    path: "/history",
    backend: DEFAULT_BACKEND,
    action: (page) =>
      page.getByRole("main").getByRole("link", { name: "Go to the library" }),
  },
  {
    name: "a creator with no series left",
    path: "/creator/Author%20A",
    backend: DEFAULT_BACKEND,
    action: (page) =>
      page
        .getByRole("main")
        .getByRole("link", { name: "Back to the library" })
        .last(),
  },
];

function noteOf(page: Page): Locator {
  return page
    .getByRole("main")
    .locator('[data-slot="empty-description"]')
    .first();
}

for (const screen of SCREENS) {
  test.describe(
    `${screen.name} on an Android phone`,
    { tag: "@native" },
    () => {
      test.use({ backend: screen.backend });

      test.beforeEach(({ platform }) => {
        test.skip(platform !== "android", "Android's empty screens");
      });

      test("sets its action 16px under its note, as Material's empty state does", async ({
        page,
      }) => {
        await page.goto(screen.path);
        const action = screen.action(page);
        await expect(action).toBeVisible();

        const [note, button] = await Promise.all([
          boxOf(noteOf(page)),
          boxOf(action),
        ]);

        expect(button.y - (note.y + note.height)).toBe(NOTE_TO_ACTION);
      });
    },
  );
}
