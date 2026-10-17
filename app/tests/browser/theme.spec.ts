import { expect, test } from "./fixtures.ts";

const NEUTRAL_THEMES = [
  {
    colorScheme: "light",
    ground: "oklch(1 0 0)",
    text: "oklch(0.145 0 0)",
  },
  {
    colorScheme: "dark",
    ground: "oklch(0.145 0 0)",
    text: "oklch(0.985 0 0)",
  },
] as const;

for (const { colorScheme, ground, text } of NEUTRAL_THEMES) {
  test(`uses the shadcn neutral ground and text colours in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const body = page.locator("body");

    await expect(body).toHaveCSS("background-color", ground);
    await expect(body).toHaveCSS("color", text);
  });
}

test("draws a part of the page in the other theme when it asks for one", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  const darkPart = await page.evaluate(() => {
    const part = document.createElement("div");
    part.dataset.theme = "dark";
    part.className = "bg-background text-foreground";
    document.body.append(part);
    const style = getComputedStyle(part);
    return { ground: style.backgroundColor, text: style.color };
  });

  expect(darkPart).toEqual({
    ground: "oklch(0.145 0 0)",
    text: "oklch(0.985 0 0)",
  });
});
