import {
  accessibilityViolations,
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const OPTION_HEIGHT = 40;
const TRACK_HEIGHT = 44;
const TAP_OVERHANG = 3;

const DEVICE_HINT = "System follows the device's setting and changes with it.";
const PHONE_HINT = "System follows your phone's setting.";

async function chooseTheme(
  page: import("@playwright/test").Page,
  label: string,
): Promise<void> {
  await page.goto("/settings");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Appearance" })
    .click();
  await page.getByRole("radio", { name: label }).click();
  await expect(page.getByRole("radio", { name: label })).toBeChecked();
  await settle(page.locator(":root"));
}

test("Dark overrides a light device and survives a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });

  await chooseTheme(page, "Dark");

  const darkGround = await tokenColour(page, "--background", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", darkGround);
  await page.reload();
  await expect(page.locator("body")).toHaveCSS("background-color", darkGround);
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("Light overrides a dark device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });

  await chooseTheme(page, "Light");

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    await tokenColour(page, "--background", "light"),
  );
});

test("System follows the device as it changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await chooseTheme(page, "System");

  await page.emulateMedia({ colorScheme: "dark" });

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    await tokenColour(page, "--background", "dark"),
  );
});

const RAISED_SHADOW = /rgba\(0, 0, 0, 0\.05\) 0px 1px 2px 0px$/;

for (const colorScheme of ["light", "dark"] as const) {
  test(`raises the chosen option with a shadow in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });

    await chooseTheme(page, "System");

    await expect(page.getByRole("radio", { name: "System" })).toHaveCSS(
      "box-shadow",
      RAISED_SHADOW,
    );
  });
}

test("draws the light or dark options 40px tall in a 44px track", async ({
  page,
}) => {
  await chooseTheme(page, "System");

  const option = await boxOf(page.getByRole("radio", { name: "Light" }));
  const track = await boxOf(page.getByRole("radiogroup"));

  expect(option.height).toBe(OPTION_HEIGHT);
  expect(track.height).toBe(TRACK_HEIGHT);
});

test("chooses an option from just outside its visible edge", async ({
  page,
}) => {
  await chooseTheme(page, "System");
  const option = await boxOf(page.getByRole("radio", { name: "Dark" }));

  await page.mouse.click(option.x + option.width / 2, option.y - TAP_OVERHANG);

  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

for (const platform of ["android", "ios", "linux"] as const) {
  test.describe(`on ${platform}`, () => {
    testOnlyInItsWebview(platform);
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

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
