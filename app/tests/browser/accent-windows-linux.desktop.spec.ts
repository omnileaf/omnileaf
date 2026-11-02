import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { expect, literalColour, onPlatform, test } from "./fixtures.ts";

interface PlatformAccent {
  readonly platform: Platform;
  readonly scheme: "light" | "dark";
  readonly accent: string;
  readonly onAccent: string;
}

const PLATFORM_ACCENTS: readonly PlatformAccent[] = [
  {
    platform: "windows",
    scheme: "light",
    accent: "#2f6f4f",
    onAccent: "#ffffff",
  },
  {
    platform: "windows",
    scheme: "dark",
    accent: "#7fcb9d",
    onAccent: "#000000",
  },
  {
    platform: "linux",
    scheme: "light",
    accent: "oklch(0.49 0.084 159.2)",
    onAccent: "oklch(1 0 0)",
  },
  {
    platform: "linux",
    scheme: "dark",
    accent: "oklch(0.78 0.101 156.6)",
    onAccent: "oklch(0.238 0.036 157.2)",
  },
];

for (const { platform, scheme, accent, onAccent } of PLATFORM_ACCENTS) {
  test.describe(`${platform} in the ${scheme} theme`, () => {
    test.use(onPlatform(platform));

    test("keeps drawing the accent as the primary colour", async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/settings");
      await page.waitForFunction(
        () => document.documentElement.dataset.platform !== undefined,
      );

      const drawn = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.className = "bg-accent text-on-accent";
        document.body.append(probe);
        const { backgroundColor, color } = getComputedStyle(probe);
        probe.remove();
        return { backgroundColor, color };
      });

      expect(drawn).toEqual({
        backgroundColor: await literalColour(page, accent),
        color: await literalColour(page, onAccent),
      });
    });
  });
}
