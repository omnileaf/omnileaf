import type { Locator, Page } from "@playwright/test";

import { viewportOf } from "./fixtures.ts";

export function showChoices(page: Page): Locator {
  return page
    .getByRole("group", { name: "Show" })
    .or(page.getByRole("radiogroup", { name: "Show" }));
}

export async function fitPhoneToShowRow(page: Page): Promise<void> {
  const spare = await showChoices(page).evaluate((group) => {
    const segments = [...group.querySelectorAll(":scope > [role=radio]")];
    const track = getComputedStyle(group);
    const room =
      group.clientWidth -
      Number.parseFloat(track.paddingInlineStart) -
      Number.parseFloat(track.paddingInlineEnd) -
      (segments.length - 1) * Number.parseFloat(track.columnGap);
    const naturals = segments.map((segment) => {
      const alone = segment.cloneNode(true);
      if (!(alone instanceof HTMLElement)) {
        throw new Error("a Show segment is not an element");
      }
      alone.style.position = "absolute";
      group.append(alone);
      const natural = alone.getBoundingClientRect().width;
      alone.remove();
      const { marginInlineStart, marginInlineEnd } = getComputedStyle(segment);
      return (
        natural +
        Number.parseFloat(marginInlineStart) +
        Number.parseFloat(marginInlineEnd)
      );
    });
    return room - segments.length * Math.max(...naturals);
  });
  const viewport = viewportOf(page);
  await page.setViewportSize({
    ...viewport,
    width: viewport.width - Math.floor(spare),
  });
  await page.evaluate(
    () =>
      new Promise((refitted) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(refitted)),
        ),
      ),
  );
}
