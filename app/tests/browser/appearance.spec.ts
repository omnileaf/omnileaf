import { AxeBuilder } from "@axe-core/playwright";

import {
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const OPTION_HEIGHT = 40;
const TRACK_HEIGHT = 44;
const TAP_OVERHANG = 3;

const DEVICE_HINT = "System follows the device's setting and changes with it.";
const PHONE_HINT = "System follows your phone's setting.";

const LIGHT_GROUND = "rgb(250, 248, 244)";
const DARK_GROUND = "rgb(22, 21, 18)";

async function chooseTheme(
  page: import("@playwright/test").Page,
  label: string,
): Promise<void> {
  await page.goto("/settings");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Appearance" })
    .click();
  await page.locator("label").filter({ hasText: label }).click();
  await expect(page.getByRole("radio", { name: label })).toBeChecked();
}

test("Dark overrides a light device and survives a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });

  await chooseTheme(page, "Dark");

  await expect(page.locator("body")).toHaveCSS("background-color", DARK_GROUND);
  await page.reload();
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_GROUND);
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("Light overrides a dark device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });

  await chooseTheme(page, "Light");

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    LIGHT_GROUND,
  );
});

test("System follows the device as it changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await chooseTheme(page, "System");

  await page.emulateMedia({ colorScheme: "dark" });

  await expect(page.locator("body")).toHaveCSS("background-color", DARK_GROUND);
});

for (const { colorScheme, shadow } of [
  {
    colorScheme: "light",
    shadow: /rgba\(28, 27, 24, 0\.14\) 0px 1px 2px 0px$/,
  },
  { colorScheme: "dark", shadow: /rgba\(0, 0, 0, 0\.5\) 0px 1px 2px 0px$/ },
] as const) {
  test(`raises the chosen option with the ${colorScheme} theme's shadow`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });

    await chooseTheme(page, "System");

    await expect(page.locator("label").filter({ hasText: "System" })).toHaveCSS(
      "box-shadow",
      shadow,
    );
  });
}

test("draws the light or dark options 40px tall in a 44px track", async ({
  page,
}) => {
  await chooseTheme(page, "System");

  const option = await boxOf(
    page.locator("label").filter({ hasText: "Light" }),
  );
  const track = await boxOf(page.getByRole("radiogroup"));

  expect(option.height).toBe(OPTION_HEIGHT);
  expect(track.height).toBe(TRACK_HEIGHT);
});

test("chooses an option from just outside its visible edge", async ({
  page,
}) => {
  await chooseTheme(page, "System");
  const option = await boxOf(page.locator("label").filter({ hasText: "Dark" }));

  await page.mouse.click(option.x + option.width / 2, option.y - TAP_OVERHANG);

  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

for (const platform of ["android", "ios", "linux"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

    test("explains what System follows in the group's description", async ({
      page,
    }) => {
      await page.goto("/settings/appearance");
      const isPhone =
        platform !== "linux" && viewportOf(page).width < MEDIUM_MIN_WIDTH;

      const group = page.getByRole("radiogroup", { name: "Light or dark" });

      await expect(group).toHaveAccessibleDescription(
        isPhone ? PHONE_HINT : DEVICE_HINT,
      );
    });
  });
}

for (const label of ["Light", "Dark"]) {
  test(`Settings › Appearance has no accessibility violations in ${label}`, async ({
    page,
  }) => {
    await chooseTheme(page, label);

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
