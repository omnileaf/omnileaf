import english from "../../messages/en.json" with { type: "json" };
import { expect, onPlatform, test } from "./fixtures.ts";

const TABLET_WINDOWS = [
  { width: 840, height: 1180 },
  { width: 1024, height: 1366 },
  { width: 1032, height: 1376 },
  { width: 1180, height: 820 },
];

for (const platform of ["ios", "android"] as const) {
  test.describe(`the Settings sections on ${platform} tablets`, () => {
    test.use(onPlatform(platform));

    test("set each section's name on one line", async ({ page }) => {
      await page.goto("/settings/library");
      const sections = page
        .getByRole("navigation", { name: english.settings_sections_label })
        .getByRole("link");

      for (const window of TABLET_WINDOWS) {
        await page.setViewportSize(window);
        await expect(sections.first()).toBeVisible();

        const wrapped = await sections.evaluateAll((links) =>
          links
            .map((link) => link.querySelector("span"))
            .filter((label) => label !== null)
            .filter(
              (label) =>
                label.getBoundingClientRect().height >
                Number.parseFloat(getComputedStyle(label).lineHeight) * 1.5,
            )
            .map((label) => label.textContent.trim()),
        );

        expect(wrapped, `at ${String(window.width)}px`).toEqual([]);
      }
    });
  });
}
