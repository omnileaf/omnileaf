import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { followCorePlatform } from "./platform";
import SegmentedControl from "./SegmentedControl.svelte";

type Theme = "light" | "dark";
type View = (typeof VIEWS)[number];

const VIEWS = ["grid", "compact", "list"] as const;

const LABELS = {
  grid: () => "Grid",
  compact: () => "Compact",
  list: () => "List",
};

interface KitSegmentColours {
  readonly focusRing: string;
  readonly restLayer: string;
  readonly chosenLayer: string;
  readonly disabledFill: string;
  readonly disabledLabel: string;
}

const KIT: Record<Theme, KitSegmentColours> = {
  light: {
    focusRing: "rgb(78, 100, 86)",
    restLayer: "rgba(88, 97, 90, 0.1)",
    chosenLayer: "rgba(230, 255, 237, 0.1)",
    disabledFill: "rgba(44, 53, 46, 0.1)",
    disabledLabel: "rgba(44, 53, 46, 0.38)",
  },
  dark: {
    focusRing: "rgb(180, 204, 187)",
    restLayer: "rgba(164, 174, 165, 0.1)",
    chosenLayer: "rgba(0, 57, 29, 0.1)",
    disabledFill: "rgba(222, 232, 223, 0.1)",
    disabledLabel: "rgba(222, 232, 223, 0.38)",
  },
};

const THEMES: readonly Theme[] = ["light", "dark"];
const KIT_GAP = 2;
const KIT_SEGMENT_INLINE = "16px";

interface Choice {
  readonly platform?: Platform;
  readonly theme?: Theme;
  readonly chosen?: View;
  readonly disabledOptions?: readonly View[];
  readonly hugsLabels?: boolean;
}

async function renderViewChoice({
  platform = "android",
  theme = "light",
  chosen = "grid",
  disabledOptions = [],
  hugsLabels = false,
}: Choice = {}): Promise<void> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  const heading = document.createElement("h2");
  heading.id = "view-heading";
  heading.textContent = "View";
  document.body.append(heading);
  await render(SegmentedControl<View>, {
    options: VIEWS,
    labels: LABELS,
    chosen,
    disabledOptions,
    hugsLabels,
    labelledBy: "view-heading",
    onChoose: () => undefined,
  });
}

function asElement(element: Element): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("the segmented control drew no element");
  }
  return element;
}

function segment(name: string): HTMLElement {
  return asElement(page.getByRole("radio", { name }).element());
}

function track(): HTMLElement {
  return asElement(page.getByRole("radiogroup", { name: "View" }).element());
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

for (const theme of THEMES) {
  const kit = KIT[theme];

  test(`rings a focused Android segment in the focus colour, 3px out by 2px, keeping its shape, in the ${theme} theme`, async () => {
    await renderViewChoice({ theme });

    await userEvent.tab();
    const grid = segment("Grid");
    await expect.element(grid).toHaveFocus();
    const style = getComputedStyle(grid);

    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineWidth).toBe("3px");
    expect(style.outlineOffset).toBe("2px");
    expect(style.outlineColor).toBe(kit.focusRing);
    expect(style.borderTopLeftRadius).toBe("20px");
    expect(style.borderTopRightRadius).toBe("20px");
    expect(style.backgroundImage).toBe(
      `linear-gradient(${kit.chosenLayer}, ${kit.chosenLayer})`,
    );
  });

  test(`lays the muted colour over a focused unchosen Android segment in the ${theme} theme`, async () => {
    await renderViewChoice({ theme, chosen: "compact" });

    await userEvent.tab();
    const compact = segment("Compact");
    await expect.element(compact).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    const list = segment("List");
    await expect.element(list).toHaveFocus();

    expect(getComputedStyle(list).backgroundImage).toBe(
      `linear-gradient(${kit.restLayer}, ${kit.restLayer})`,
    );
  });

  test(`greys a disabled Android segment the kit's way in the ${theme} theme`, async () => {
    await renderViewChoice({ theme, disabledOptions: ["list"] });

    const style = getComputedStyle(segment("List"));

    expect(style.backgroundColor).toBe(kit.disabledFill);
    expect(style.color).toBe(kit.disabledLabel);
    expect(style.opacity).toBe("1");
  });
}

test("sizes Android's segments to their labels when asked to hug them", async () => {
  await renderViewChoice({ hugsLabels: true });

  const grid = segment("Grid").getBoundingClientRect();
  const compact = segment("Compact").getBoundingClientRect();
  const list = segment("List").getBoundingClientRect();
  const drawn = track().getBoundingClientRect();

  expect(getComputedStyle(segment("Grid")).paddingInlineStart).toBe(
    KIT_SEGMENT_INLINE,
  );
  expect(compact.width).toBeGreaterThan(grid.width);
  expect(drawn.width).toBeCloseTo(
    grid.width + compact.width + list.width + 2 * KIT_GAP,
    0,
  );
  expect(drawn.width).toBeLessThan(
    asElement(document.body).getBoundingClientRect().width,
  );
});

test("keeps Android's segments filling the row when not asked to hug", async () => {
  await renderViewChoice();

  expect(track().getBoundingClientRect().width).toBeCloseTo(
    asElement(document.body).getBoundingClientRect().width,
    0,
  );
});

test("keeps iOS's focused and disabled segments as they were", async () => {
  await renderViewChoice({ platform: "ios", disabledOptions: ["list"] });

  await userEvent.tab();
  const grid = segment("Grid");
  await expect.element(grid).toHaveFocus();

  expect(getComputedStyle(grid).outlineWidth).toBe("2px");
  expect(getComputedStyle(grid).outlineOffset).toBe("0px");
  expect(getComputedStyle(segment("List")).opacity).toBe("0.5");
});
