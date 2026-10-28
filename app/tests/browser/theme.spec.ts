import { expect, literalColour, onPlatform, test } from "./fixtures.ts";

interface ThemeColours {
  readonly colorScheme: "light" | "dark";
  readonly ground: string;
  readonly text: string;
}

const MIST_THEMES: readonly ThemeColours[] = [
  {
    colorScheme: "light",
    ground: "oklch(1 0 0)",
    text: "oklch(0.148 0.004 228.8)",
  },
  {
    colorScheme: "dark",
    ground: "oklch(0.148 0.004 228.8)",
    text: "oklch(0.987 0.002 197.1)",
  },
];

const NEUTRAL_THEMES: readonly ThemeColours[] = [
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
];

for (const { colorScheme, ground, text } of MIST_THEMES) {
  test(`uses shadcn's mist ground and text on linux in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const body = page.locator("body");

    await expect(body).toHaveCSS(
      "background-color",
      await literalColour(page, ground),
    );
    await expect(body).toHaveCSS("color", await literalColour(page, text));
  });
}

test.describe("on macos", () => {
  test.use(onPlatform("macos"));

  for (const { colorScheme, ground, text } of NEUTRAL_THEMES) {
    test(`keeps the shadcn neutral ground and text on macos in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");

      const body = page.locator("body");

      await expect(body).toHaveCSS(
        "background-color",
        await literalColour(page, ground),
      );
      await expect(body).toHaveCSS("color", await literalColour(page, text));
    });
  }
});

test("draws a part of the page in the other theme when it asks for one", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator(":root")).toHaveAttribute("data-platform", "linux");

  const darkPart = await page.evaluate(() => {
    const part = document.createElement("div");
    part.dataset.theme = "dark";
    part.className = "bg-background text-foreground";
    document.body.append(part);
    const style = getComputedStyle(part);
    return { ground: style.backgroundColor, text: style.color };
  });

  expect(darkPart).toEqual({
    ground: await literalColour(page, "oklch(0.148 0.004 228.8)"),
    text: await literalColour(page, "oklch(0.987 0.002 197.1)"),
  });
});
