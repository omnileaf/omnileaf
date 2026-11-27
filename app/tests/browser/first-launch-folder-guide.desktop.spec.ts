import type { FakeBackend } from "./fake-backend.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { folderRow, goToStep, openFolderGuide } from "./first-launch-steps.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

const HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "~/Omnileaf",
  isAvailable: true,
};
const COMICS: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Comics",
  location: "/mnt/media/Comics",
  isAvailable: true,
};

const LINK_STEP = 2;
const LINK_HEADING = "Already have comics or books?";

let folderLoads = 0;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    firstLaunchFinished: () => false,
    libraryFolders: () => {
      folderLoads += 1;
      return { folders: [HOME, COMICS], next: null };
    },
  },
});

test.beforeEach(() => {
  folderLoads = 0;
});

test("the folder step opens How folders are read", async ({ page }) => {
  await goToStep(page, LINK_STEP);

  await openFolderGuide(page);

  await expect(
    page.getByRole("table", { name: "An example folder" }),
  ).toBeVisible();
});

test("stacks Files under Folders in the setup dialog, where the list has less room", async ({
  page,
}) => {
  await goToStep(page, LINK_STEP);
  await openFolderGuide(page);
  const folders = await boxOf(
    page.getByRole("list", { name: "Folders", exact: true }),
  );
  const files = await boxOf(
    page.getByRole("list", { name: "Files", exact: true }),
  );

  expect(files.x).toBeCloseTo(folders.x, 0);
  expect(files.y).toBeGreaterThan(folders.y + folders.height - 1);
});

test("Back from the guide returns to the folder step without loading its folders again", async ({
  page,
}) => {
  await goToStep(page, LINK_STEP);
  await expect(folderRow(page, COMICS.name)).toBeVisible();
  const loadsBeforeTheGuide = folderLoads;
  await openFolderGuide(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "Back", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: LINK_HEADING }),
  ).toBeFocused();
  await expect(folderRow(page, COMICS.name)).toBeVisible();
  expect(folderLoads).toBe(loadsBeforeTheGuide);
});
