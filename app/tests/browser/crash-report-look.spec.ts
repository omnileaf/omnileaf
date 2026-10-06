import type { Locator, Page } from "@playwright/test";

import type { CrashReportOffer } from "../../src/lib/ipc/bindings.ts";
import { boxOf, expect, onPlatform, test, viewportOf } from "./fixtures.ts";

const SAVED_PANIC: CrashReportOffer = {
  details: "Omnileaf 1.2.3 on Linux\nPanic: index out of bounds\n",
  origin: "panic",
};

const DIALOG_LOOK = {
  badge: 36,
  button: 40,
  corner: "16px",
  inset: "20px",
  title: "17px",
  body: "14px",
  width: 420,
  well: "rgb(243, 240, 233)",
  accent: "rgb(47, 111, 79)",
};

function prompt(page: Page): Locator {
  return page.getByRole("alertdialog");
}

function badgeOf(page: Page): Locator {
  return prompt(page).locator("[data-prompt-badge]");
}

function titleOf(page: Page): Locator {
  return prompt(page).getByRole("heading");
}

function styleOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

for (const platform of ["android", "linux"] as const) {
  test.describe(`on ${platform}, the crash report header`, () => {
    test.use({
      backend: {
        ...onPlatform(platform).backend,
        offerSavedCrashReport: () => SAVED_PANIC,
      },
    });

    test("sets the badge beside the title, on its first line", async ({
      page,
    }) => {
      await page.goto("/");

      const badge = await boxOf(badgeOf(page));
      const title = await boxOf(titleOf(page));
      const lineHeight = Number.parseFloat(
        await styleOf(titleOf(page), "line-height"),
      );

      expect(badge.x + badge.width).toBeLessThanOrEqual(title.x);
      expect(badge.y).toBeLessThan(title.y + lineHeight);
      expect(badge.y + badge.height).toBeGreaterThan(title.y);
    });

    test("draws the badge as a round, accent-toned circle", async ({
      page,
    }) => {
      await page.goto("/");

      const badge = await boxOf(badgeOf(page));

      expect(badge.width).toBe(DIALOG_LOOK.badge);
      expect(badge.height).toBe(DIALOG_LOOK.badge);
      expect(
        Number.parseFloat(await styleOf(badgeOf(page), "border-radius")),
      ).toBeGreaterThanOrEqual(DIALOG_LOOK.badge / 2);
      await expect(badgeOf(page)).toHaveAttribute("aria-hidden", "true");
    });
  });
}

test.describe("on desktop, the crash report dialog", () => {
  test.use({
    backend: {
      ...onPlatform("linux").backend,
      offerSavedCrashReport: () => SAVED_PANIC,
    },
  });

  test("frames itself as the confirm dialog does", async ({ page }) => {
    await page.goto("/");

    expect(await styleOf(prompt(page), "border-start-start-radius")).toBe(
      DIALOG_LOOK.corner,
    );
    expect(await styleOf(prompt(page), "padding-block-start")).toBe(
      DIALOG_LOOK.inset,
    );
    expect(await styleOf(prompt(page), "padding-inline-start")).toBe(
      DIALOG_LOOK.inset,
    );
  });

  test("is a 420px card where the window has room", async ({ page }) => {
    await page.goto("/");
    test.skip(
      viewportOf(page).width <= DIALOG_LOOK.width,
      "windows wider than the card",
    );

    const card = await boxOf(prompt(page));

    expect(card.width).toBe(DIALOG_LOOK.width);
  });

  test("sets the details on the well colour", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    expect(
      await styleOf(
        prompt(page).getByText("Panic: index out of bounds"),
        "background-color",
      ),
    ).toBe(DIALOG_LOOK.well);
  });

  test("sets the title and body at the dialog sizes", async ({ page }) => {
    await page.goto("/");

    expect(await styleOf(titleOf(page), "font-size")).toBe(DIALOG_LOOK.title);
    expect(await styleOf(titleOf(page), "font-weight")).toBe("700");
    expect(
      await styleOf(prompt(page).getByText(/^Nothing was lost/), "font-size"),
    ).toBe(DIALOG_LOOK.body);
  });

  test("sizes its buttons 40px tall, the report last on the end side", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(prompt(page)).toBeVisible();

    const buttons = await prompt(page).getByRole("button").all();
    const boxes = await Promise.all(buttons.map((button) => boxOf(button)));
    const send = await boxOf(
      prompt(page).getByRole("button", { name: "Send report" }),
    );

    for (const box of boxes) {
      expect(box.height).toBe(DIALOG_LOOK.button);
    }
    expect(send.x + send.width).toBe(
      Math.max(...boxes.map((box) => box.x + box.width)),
    );
  });

  test("ends its padding below the buttons while nothing failed", async ({
    page,
  }) => {
    await page.goto("/");

    const card = await boxOf(prompt(page));
    const send = await boxOf(
      prompt(page).getByRole("button", { name: "Send report" }),
    );
    const edge =
      Number.parseFloat(await styleOf(prompt(page), "padding-block-end")) +
      Number.parseFloat(await styleOf(prompt(page), "border-bottom-width"));

    expect(card.y + card.height - (send.y + send.height)).toBe(edge);
  });

  test("offers Copy details as a text button at the start", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(prompt(page)).toBeVisible();

    const copy = prompt(page).getByRole("button", { name: "Copy details" });
    const starts = await Promise.all(
      (await prompt(page).getByRole("button").all()).map(
        async (button) => (await boxOf(button)).x,
      ),
    );

    expect((await boxOf(copy)).x).toBe(Math.min(...starts));
    expect(await styleOf(copy, "border-top-width")).toBe("0px");
    expect(await styleOf(copy, "color")).toBe(DIALOG_LOOK.accent);
  });
});
