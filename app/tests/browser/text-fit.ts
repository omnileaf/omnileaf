import type { Page } from "@playwright/test";

const CONTROLS =
  "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=link], [role=menuitem], [role=option], [role=radio], [role=slider], [role=switch], [role=tab]";
const LEAST_OVERLAP_PX = 2;
const CLIP_TOLERANCE_PX = 1;
const NAME_LENGTH = 40;

/** Names text cut off at the bottom of a box that hides its overflow, unless the text ends on a line clamp or an ellipsis. */
export function textClippedUnmarked(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ tolerance, nameLength }) => {
      const isMarkedCut = (element: Element): boolean => {
        const style = getComputedStyle(element);
        return (
          style.textOverflow === "ellipsis" ||
          style.webkitLineClamp !== "none" ||
          style.clipPath !== "none"
        );
      };
      const problems: string[] = [];
      for (const box of document.body.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(box);
        const hidesOverflow = ["hidden", "clip"].includes(style.overflowY);
        const cutBy = box.scrollHeight - box.clientHeight;
        if (
          hidesOverflow &&
          cutBy > tolerance &&
          box.clientHeight > 1 &&
          box.closest("[aria-hidden=true], [inert]") === null &&
          !isMarkedCut(box)
        ) {
          const bottom = box.getBoundingClientRect().bottom;
          const texts = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
          for (
            let node = texts.nextNode();
            node !== null;
            node = texts.nextNode()
          ) {
            const holder = node.parentElement;
            if (
              holder !== null &&
              /\S/.test(node.textContent ?? "") &&
              !isMarkedCut(holder) &&
              getComputedStyle(holder).visibility !== "hidden"
            ) {
              const range = document.createRange();
              range.selectNodeContents(node);
              const rects = [...range.getClientRects()].filter(
                (rect) => rect.width > 1 && rect.height > 1,
              );
              const cut = rects.some(
                (rect) => rect.bottom > bottom + tolerance,
              );
              if (cut) {
                problems.push(
                  `“${(node.textContent ?? "").trim().slice(0, nameLength)}” is cut off at the bottom of a box that hides its overflow`,
                );
                break;
              }
            }
          }
        }
      }
      return problems;
    },
    { tolerance: CLIP_TOLERANCE_PX, nameLength: NAME_LENGTH },
  );
}

/** Names lines of text that overlap other text, and controls that overlap other controls, leaving out what floats above the page on purpose, such as a toast, a sticky bar or an open dialog. */
export function overlaps(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ controls, least, nameLength }) => {
      const modal = document.querySelector(
        "[role=dialog][aria-modal=true], [role=alertdialog]",
      );
      const layerOf = (element: Element): Element | null => {
        for (
          let up: Element | null = element;
          up !== null;
          up = up.parentElement
        ) {
          const { position } = getComputedStyle(up);
          if (position === "fixed" || position === "sticky") {
            return up;
          }
        }
        return null;
      };
      const isSeen = (element: Element): boolean => {
        if (modal !== null && !modal.contains(element)) {
          return false;
        }
        if (element.closest("[aria-hidden=true], [inert]") !== null) {
          return false;
        }
        for (
          let up: Element | null = element;
          up !== null;
          up = up.parentElement
        ) {
          const style = getComputedStyle(up);
          if (
            style.visibility === "hidden" ||
            style.opacity === "0" ||
            style.clipPath !== "none"
          ) {
            return false;
          }
        }
        return true;
      };
      interface Piece {
        readonly owner: Element;
        readonly rect: DOMRect;
        readonly name: string;
        readonly layer: Element | null;
      }
      const shownPartOf = (rect: DOMRect, element: Element): DOMRect | null => {
        let left = rect.left;
        let top = rect.top;
        let right = rect.right;
        let bottom = rect.bottom;
        for (
          let up: Element | null = element;
          up !== null;
          up = up.parentElement
        ) {
          const style = getComputedStyle(up);
          if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            const box = up.getBoundingClientRect();
            left = Math.max(left, box.left);
            top = Math.max(top, box.top);
            right = Math.min(right, box.right);
            bottom = Math.min(bottom, box.bottom);
          }
        }
        return right - left > 1 && bottom - top > 1
          ? new DOMRect(left, top, right - left, bottom - top)
          : null;
      };
      const lines: Piece[] = [];
      const texts = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (
        let node = texts.nextNode();
        node !== null;
        node = texts.nextNode()
      ) {
        const owner = node.parentElement;
        if (
          owner !== null &&
          /\S/.test(node.textContent ?? "") &&
          isSeen(owner)
        ) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const whole of range.getClientRects()) {
            const rect = shownPartOf(whole, owner);
            if (rect !== null) {
              lines.push({
                owner,
                rect,
                name: (node.textContent ?? "").trim().slice(0, nameLength),
                layer: layerOf(owner),
              });
            }
          }
        }
      }
      const shownControls: Piece[] = [
        ...document.body.querySelectorAll(controls),
      ]
        .filter(isSeen)
        .flatMap((owner) => {
          const rect = shownPartOf(
            owner.getBoundingClientRect(),
            owner.parentElement ?? owner,
          );
          return rect === null
            ? []
            : [
                {
                  owner,
                  rect,
                  name: (owner.getAttribute("aria-label") ?? owner.textContent)
                    .trim()
                    .slice(0, nameLength),
                  layer: layerOf(owner),
                },
              ];
        });
      const overlapOf = (one: DOMRect, other: DOMRect): number =>
        Math.min(
          Math.min(one.right, other.right) - Math.max(one.left, other.left),
          Math.min(one.bottom, other.bottom) - Math.max(one.top, other.top),
        );
      const problems = new Set<string>();
      const compare = (pieces: readonly Piece[], kind: string): void => {
        for (let index = 0; index < pieces.length; index += 1) {
          const one = pieces[index];
          for (
            let next = index + 1;
            one !== undefined && next < pieces.length;
            next += 1
          ) {
            const other = pieces[next];
            if (
              other !== undefined &&
              one.owner !== other.owner &&
              !one.owner.contains(other.owner) &&
              !other.owner.contains(one.owner) &&
              one.layer === other.layer &&
              overlapOf(one.rect, other.rect) > least
            ) {
              problems.add(`${kind} “${one.name}” overlaps “${other.name}”`);
            }
          }
        }
      };
      compare(lines, "text");
      compare(shownControls, "control");
      return [...problems];
    },
    { controls: CONTROLS, least: LEAST_OVERLAP_PX, nameLength: NAME_LENGTH },
  );
}
