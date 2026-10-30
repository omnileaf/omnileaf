import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";

const ACCENT = "rgb(47, 111, 79)";
const HOME_LOCATION = "C:\\Users\\Reader\\Documents\\Omnileaf";

test.describe("the first launch on Windows", () => {
  testOnlyInItsWebview("windows");
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: onPlatform("windows").backend.appInfo,
      firstLaunchFinished: () => false,
      libraryFolders: () => ({
        folders: [
          {
            id: "1",
            kind: "home",
            name: "Omnileaf",
            location: HOME_LOCATION,
            isAvailable: true,
          },
          {
            id: "2",
            kind: "linked",
            name: "Comics",
            location: "D:\\Comics",
            isAvailable: true,
          },
        ],
        next: null,
      }),
    },
  });

  test("lines the welcome up in one column with its accent button at the bottom right", async ({
    page,
  }) => {
    await page.goto("/first-launch");
    const title = page.getByRole("heading", {
      level: 1,
      name: "Welcome to Omnileaf",
    });
    await expect(title).toBeVisible();
    const get = page.getByRole("button", { name: "Get started" });

    const titleBox = await boxOf(title);
    const promise = await boxOf(page.getByText("Reads what you already have"));
    const button = await boxOf(get);

    await expect(title).toHaveCSS("text-align", "start");
    expect(titleBox.x).toBeLessThan(promise.x);
    expect(button.x + button.width).toBe(viewportOf(page).width - 24);
    expect(button.y + button.height).toBeLessThan(viewportOf(page).height);
    await expect(get).toHaveCSS("background-color", ACCENT);
  });

  test("puts Back at the top left and the step bar at the top right of a full page", async ({
    page,
  }) => {
    await page.goto("/first-launch");
    await page.getByRole("button", { name: "Get started" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Where your library lives" }),
    ).toBeVisible();

    const back = await boxOf(page.getByRole("button", { name: "Back" }));
    const progress = page.getByRole("progressbar", { name: "Setting up" });
    const bar = await boxOf(progress);

    expect(back.x).toBeLessThan(bar.x);
    expect(back.y).toBeLessThan(64);
    expect([back.width, back.height]).toEqual([32, 32]);
    expect(bar.x + bar.width).toBeGreaterThan(viewportOf(page).width - 24 - 1);
    await expect(progress).toHaveText("1 of 3");
    await expect(page.getByText(HOME_LOCATION)).toBeVisible();
  });

  test("keeps the home folder on one card with Change at its end, what it holds on another", async ({
    page,
  }) => {
    await page.goto("/first-launch");
    await page.getByRole("button", { name: "Get started" }).click();
    const card = page.getByRole("region", { name: "Home folder" });
    await expect(card).toBeVisible();

    const change = await boxOf(
      card.getByRole("button", { name: "Change", exact: true }),
    );
    const path = await boxOf(card.getByText(HOME_LOCATION));
    const keeps = await boxOf(card.getByText("Keeps", { exact: true }));

    expect(change.x).toBeGreaterThan(path.x + path.width);
    expect(keeps.y).toBeGreaterThan(path.y + path.height);
    await expect(card.locator("code")).toHaveCount(0);
  });

  test("sets each linked folder on a card and the drop area under them with a dashed edge", async ({
    page,
  }) => {
    await page.goto("/first-launch");
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    const row = page.getByRole("listitem").filter({ hasText: "D:\\Comics" });
    const drop = page.getByRole("group", { name: "Drop folders here" });
    await expect(row).toBeVisible();

    await expect(row).toHaveCSS("border-top-width", "1px");
    await expect(row).toHaveCSS("border-top-left-radius", "4px");
    await expect(drop).toHaveCSS("border-top-style", "dashed");
    await expect(drop).toHaveCSS("border-top-width", "1px");
    expect((await boxOf(drop)).y).toBeGreaterThan(
      (await boxOf(row)).y + (await boxOf(row)).height,
    );
    await expect(drop.getByRole("button", { name: "Add a folder" })).toHaveCSS(
      "border-top-width",
      "1px",
    );
  });

  test("tells the last step with a check in the Windows success colour, left aligned", async ({
    page,
  }) => {
    await page.goto("/first-launch");
    for (const name of ["Get started", "Continue", "Continue", "Continue"]) {
      await page.getByRole("button", { name }).click();
    }
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible();
    const mark = title.locator(
      "xpath=preceding-sibling::*[1]/descendant-or-self::*[self::span][1]",
    );

    await expect(mark).toHaveCSS("color", "rgb(15, 123, 15)");
    await expect(title).toHaveCSS("text-align", "start");
    expect((await boxOf(mark)).x).toBe((await boxOf(title)).x);
  });

  test("sets each choice on a card with its segmented control at the end of the row", async ({
    page,
  }) => {
    await page.goto("/first-launch");
    for (const name of ["Get started", "Continue", "Continue"]) {
      await page.getByRole("button", { name }).click();
    }
    const appearance = page.getByRole("region", { name: "Appearance" });
    const covers = page.getByRole("region", { name: "18+ covers" });
    await expect(appearance).toBeVisible();

    const card = await boxOf(appearance);
    const title = await boxOf(
      appearance.getByRole("heading", { name: "Appearance" }),
    );
    const control = await boxOf(
      appearance.getByRole("radiogroup", { name: "Appearance" }),
    );

    if (viewportOf(page).width < MEDIUM_MIN_WIDTH) {
      expect(control.y).toBeGreaterThan(title.y + title.height);
    } else {
      expect(control.x).toBeGreaterThan(title.x + title.width);
    }
    expect(control.x + control.width).toBeLessThanOrEqual(
      card.x + card.width - 16,
    );
    await expect(appearance).toHaveCSS("border-top-width", "1px");
    expect((await boxOf(covers)).y).toBeGreaterThan(card.y + card.height);
    await expect(covers.getByRole("radio", { name: "Blur" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
