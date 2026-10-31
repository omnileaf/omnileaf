import type { Locator, Page } from "@playwright/test";

export const BUTTON_HEIGHT = 32;
export const NO_SHADOW = /^(none|(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+)$/;
const MOST_TABS = 40;

interface ThemeLook {
  readonly card: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly standard: string;
  readonly standardBottomEdge: string;
  readonly ring: string;
  readonly innerRing: string;
  readonly progressTrack: string;
}

export const THEMES = {
  light: {
    card: "rgba(255, 255, 255, 0.7)",
    accent: "rgb(47, 111, 79)",
    onAccent: "rgb(255, 255, 255)",
    standard: "rgba(255, 255, 255, 0.7)",
    standardBottomEdge: "rgba(0, 0, 0, 0.16)",
    ring: "rgba(0, 0, 0, 0.894)",
    innerRing: "rgba(255, 255, 255, 0.7) 0px 0px 0px 1px",
    progressTrack: "rgba(0, 0, 0, 0.447)",
  },
  dark: {
    card: "rgba(255, 255, 255, 0.05)",
    accent: "rgb(127, 203, 157)",
    onAccent: "rgb(0, 0, 0)",
    standard: "rgba(255, 255, 255, 0.06)",
    standardBottomEdge: "rgba(255, 255, 255, 0.07)",
    ring: "rgb(255, 255, 255)",
    innerRing: "rgba(0, 0, 0, 0.7) 0px 0px 0px 1px",
    progressTrack: "rgba(255, 255, 255, 0.545)",
  },
} as const satisfies Record<"light" | "dark", ThemeLook>;

export function escapedForPattern(text: string): string {
  return text.replaceAll(/[().]/g, String.raw`\$&`);
}

export async function colourOf(page: Page, value: string): Promise<string> {
  return page.evaluate((colour) => {
    const probe = document.createElement("span");
    probe.style.color = colour;
    document.body.append(probe);
    const drawn = getComputedStyle(probe).color;
    probe.remove();
    return drawn;
  }, value);
}

export async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let tab = 0; tab < MOST_TABS; tab += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }
  throw new Error("Tab never reached the control");
}
