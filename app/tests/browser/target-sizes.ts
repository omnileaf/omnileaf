import type { Page } from "@playwright/test";

const CONTROLS =
  "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=link], [role=menuitem], [role=option], [role=radio], [role=slider], [role=switch], [role=tab]";
const SMALLEST_TARGET_PX: Readonly<Record<string, number>> = {
  android: 48,
  ios: 44,
};
const SMALLEST_POINTER_TARGET_PX = 24;
const NAME_LENGTH = 40;

/** Names each control whose target, counting a touch bleed drawn by its ::before, is smaller than its platform asks (48px on Android, 44px on iOS and 24px for a pointer) and has another control within a circle that size around its middle, the spacing rule WCAG 2.5.8 allows. */
export function targetsTooSmall(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ controls, smallest, smallestPointer, nameLength }) => {
      const platform = document.documentElement.dataset.platform ?? "";
      const least = smallest[platform] ?? smallestPointer;
      const bleedOf = (element: Element): { width: number; height: number } => {
        const before = getComputedStyle(element, "::before");
        const isDrawn =
          before.content !== "none" && before.position === "absolute";
        return {
          width: isDrawn ? Number.parseFloat(before.width) || 0 : 0,
          height: isDrawn ? Number.parseFloat(before.height) || 0 : 0,
        };
      };
      const isInRunningText = (element: Element): boolean =>
        getComputedStyle(element).display === "inline" &&
        element.parentElement !== null &&
        element.parentElement.textContent.trim().length >
          element.textContent.trim().length;
      const isShown = (control: Element): boolean => {
        const box = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.visibility !== "hidden" &&
          style.pointerEvents !== "none" &&
          control.closest("[aria-hidden=true], [inert], [disabled]") === null
        );
      };
      const shown = [...document.body.querySelectorAll(controls)].filter(
        isShown,
      );
      const crowds = (control: Element): boolean => {
        const box = control.getBoundingClientRect();
        const middleX = box.left + box.width / 2;
        const middleY = box.top + box.height / 2;
        const radius = least / 2;
        return shown.some((other) => {
          if (
            other === control ||
            other.contains(control) ||
            control.contains(other)
          ) {
            return false;
          }
          const near = other.getBoundingClientRect();
          const gapX = Math.max(near.left - middleX, 0, middleX - near.right);
          const gapY = Math.max(near.top - middleY, 0, middleY - near.bottom);
          return gapX * gapX + gapY * gapY < radius * radius;
        });
      };
      const problems: string[] = [];
      for (const control of shown) {
        if (!isInRunningText(control)) {
          const box = control.getBoundingClientRect();
          const bleed = bleedOf(control);
          const width = Math.max(box.width, bleed.width);
          const height = Math.max(box.height, bleed.height);
          const isSmall = width < least - 0.5 || height < least - 0.5;
          if (isSmall && crowds(control)) {
            const name = (
              control.getAttribute("aria-label") ?? control.textContent
            )
              .trim()
              .slice(0, nameLength);
            problems.push(
              `${control.tagName.toLowerCase()} “${name}” offers ${width.toFixed(0)}×${height.toFixed(0)}px, under ${String(least)}px`,
            );
          }
        }
      }
      return problems;
    },
    {
      controls: CONTROLS,
      smallest: SMALLEST_TARGET_PX,
      smallestPointer: SMALLEST_POINTER_TARGET_PX,
      nameLength: NAME_LENGTH,
    },
  );
}
