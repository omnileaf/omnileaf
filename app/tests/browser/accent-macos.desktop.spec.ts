import type { Page } from "@playwright/test";

import {
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

interface AccentLook {
  readonly name: string;
  readonly scheme: "light" | "dark";
  readonly contrast: "standard" | "more";
  readonly accent: string;
  readonly onAccent: string;
  readonly ink: string;
  readonly soft: string;
}

const LOOKS: readonly AccentLook[] = [
  {
    name: "light",
    scheme: "light",
    contrast: "standard",
    accent: "#2f6f4f",
    onAccent: "#ffffff",
    ink: "#2f6f4f",
    soft: "#ddebe2",
  },
  {
    name: "dark",
    scheme: "dark",
    contrast: "standard",
    accent: "#2e7d55",
    onAccent: "#ffffff",
    ink: "#7fcb9d",
    soft: "#243a2c",
  },
  {
    name: "light with increased contrast",
    scheme: "light",
    contrast: "more",
    accent: "#1f5a3c",
    onAccent: "#ffffff",
    ink: "#1f5a3c",
    soft: "#cfe3d6",
  },
  {
    name: "dark with increased contrast",
    scheme: "dark",
    contrast: "more",
    accent: "#2e7d55",
    onAccent: "#ffffff",
    ink: "#a8e0bd",
    soft: "#2c4a37",
  },
];

interface DrawnAccent {
  readonly fill: string;
  readonly onFill: string;
  readonly ink: string;
  readonly soft: string;
}

const MORE_CONTRAST = "more";

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: { width: 1280, height: 800 } });

async function drawnAccent(page: Page): Promise<DrawnAccent> {
  return page.evaluate(() => {
    const drawn = (
      setUp: (probe: HTMLElement) => void,
      property: "color" | "backgroundColor",
    ) => {
      const probe = document.createElement("span");
      setUp(probe);
      document.body.append(probe);
      const colour = getComputedStyle(probe)[property];
      probe.remove();
      return colour;
    };
    const withClass = (name: string) => (probe: HTMLElement) => {
      probe.className = name;
    };
    return {
      fill: drawn(withClass("bg-accent"), "backgroundColor"),
      onFill: drawn(withClass("text-on-accent"), "color"),
      ink: drawn(withClass("text-accent"), "color"),
      soft: drawn(withClass("bg-accent-soft"), "backgroundColor"),
    };
  });
}

for (const look of LOOKS) {
  test(`draws the accent in Omnileaf green in the ${look.name} look`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: look.scheme });
    await page.goto("/settings");
    await page.waitForFunction(
      () => document.documentElement.dataset.platform !== undefined,
    );
    if (look.contrast === MORE_CONTRAST) {
      await page.evaluate((contrast) => {
        document.documentElement.dataset.contrast = contrast;
      }, look.contrast);
    }

    const drawn = await drawnAccent(page);

    expect(drawn).toEqual({
      fill: await literalColour(page, look.accent),
      onFill: await literalColour(page, look.onAccent),
      ink: await literalColour(page, look.ink),
      soft: await literalColour(page, look.soft),
    });
  });
}

test("fills the empty library's Add a folder button with the accent", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Add a folder" })).toHaveCSS(
    "background-color",
    await literalColour(page, "#2f6f4f"),
  );
});

test("shades the accent under the pointer", async ({ page }) => {
  await page.goto("/settings");
  await page.evaluate(() => {
    const probe = document.createElement("button");
    probe.id = "accent-probe";
    probe.className = "hover:bg-accent-hover";
    probe.style.cssText =
      "position: fixed; inset-block-start: 0; inset-inline-start: 0; width: 40px; height: 40px; z-index: 2147483647;";
    document.body.append(probe);
  });
  const probe = page.locator("#accent-probe");

  await probe.hover();

  await expect(probe).toHaveCSS(
    "background-color",
    await literalColour(page, "color-mix(in oklab, #2f6f4f 90%, transparent)"),
  );
});
