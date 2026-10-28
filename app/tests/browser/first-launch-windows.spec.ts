import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
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
    expect(bar.x + bar.width).toBeGreaterThan(viewportOf(page).width - 24 - 1);
    await expect(progress).toHaveText("1 of 3");
    await expect(page.getByText(HOME_LOCATION)).toBeVisible();
  });
});
