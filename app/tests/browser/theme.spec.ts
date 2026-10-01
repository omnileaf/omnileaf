import { expect, test } from "./fixtures.ts";

const PAPER_THEMES = [
  {
    colorScheme: "light",
    ground: "rgb(250, 248, 244)",
    text: "rgb(28, 27, 24)",
  },
  {
    colorScheme: "dark",
    ground: "rgb(22, 21, 18)",
    text: "rgb(241, 237, 228)",
  },
] as const;

for (const { colorScheme, ground, text } of PAPER_THEMES) {
  test(`uses the Paper ground and text colours in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const body = page.locator("body");

    await expect(body).toHaveCSS("background-color", ground);
    await expect(body).toHaveCSS("color", text);
  });
}
