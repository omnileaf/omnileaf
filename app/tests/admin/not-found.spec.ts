import { expectHeadingFocused, heading } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { openSignedIn } from "./sign-in.ts";

test("an address with no page shows the not-found page inside the shell", async ({
  page,
}) => {
  await openSignedIn(page, "/admin/nothing-here");

  await expect(heading(page)).toHaveText("Page not found");
  await expect(page).toHaveTitle("Page not found · Omnileaf admin");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("the link on the not-found page leads back to the dashboard", async ({
  page,
}) => {
  await openSignedIn(page, "/admin/nothing-here");

  await page.getByRole("link", { name: "Back to the dashboard" }).click();

  await expect(heading(page)).toHaveText("Dashboard");
  await expectHeadingFocused(page);
});

test("going back to the not-found page moves focus to its heading", async ({
  page,
}) => {
  await openSignedIn(page, "/admin/nothing-here");
  await page.getByRole("link", { name: "Back to the dashboard" }).click();
  await expect(heading(page)).toHaveText("Dashboard");

  await page.goBack();

  await expect(heading(page)).toHaveText("Page not found");
  await expectHeadingFocused(page);
});
