import type { Page } from "@playwright/test";

const LARGEST_ICON_PX = 32;
const WIDEST_ICON_GAP_PX = 24;
const ROW_SLACK_PX = 8;
const LEVELS_UP_TO_THE_TEXT = 4;
const CENTRE_TOLERANCE_PX = 1;
const NAME_LENGTH = 40;
const CONTROLS =
  "button, a, label, summary, [role=button], [role=checkbox], [role=link], [role=menuitem], [role=option], [role=radio], [role=switch], [role=tab]";

/** Names each small icon leading a run of text that sits centred neither on the text's first line nor on the whole block of text beside it. */
export function iconsOffTheirLine(page: Page): Promise<string[]> {
  return page.evaluate(
    ({
      largest,
      widestGap,
      slack,
      levels,
      tolerance,
      nameLength,
      controls,
    }) => {
      const middleOf = (box: DOMRect): number => box.top + box.height / 2;
      const firstTextAfter = (icon: SVGSVGElement): Text | undefined => {
        const control = icon.closest(controls);
        let row = icon.parentElement;
        for (let level = 0; row !== null && level < levels; level += 1) {
          const texts = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          for (
            let node = texts.nextNode();
            node !== null;
            node = texts.nextNode()
          ) {
            const follows =
              icon.compareDocumentPosition(node) &
              Node.DOCUMENT_POSITION_FOLLOWING;
            const holder = node.parentElement?.getBoundingClientRect();
            if (
              node instanceof Text &&
              follows !== 0 &&
              /\S/.test(node.data) &&
              holder !== undefined &&
              holder.width > 1 &&
              holder.height > 1
            ) {
              return node;
            }
          }
          if (row === control) {
            return undefined;
          }
          row = row.parentElement;
        }
        return undefined;
      };
      const firstGlyphOf = (text: Text): DOMRect => {
        const offset = text.data.search(/\S/);
        const glyph = document.createRange();
        glyph.setStart(text, offset);
        glyph.setEnd(text, offset + 1);
        return glyph.getBoundingClientRect();
      };
      const blockBeside = (icon: SVGSVGElement, text: Text): Element => {
        let block: Element | null = text.parentElement;
        while (block?.parentElement && !block.parentElement.contains(icon)) {
          block = block.parentElement;
        }
        return block ?? icon;
      };
      const problems: string[] = [];
      for (const icon of document.body.querySelectorAll("svg")) {
        const box = icon.getBoundingClientRect();
        const isIcon =
          box.width > 0 &&
          box.height > 0 &&
          box.width <= largest &&
          box.height <= largest;
        const text = isIcon ? firstTextAfter(icon) : undefined;
        const glyph = text === undefined ? undefined : firstGlyphOf(text);
        const leadsIt =
          glyph !== undefined &&
          glyph.width > 0 &&
          glyph.left >= box.right - 1 &&
          glyph.left - box.right <= widestGap &&
          glyph.top < box.bottom + slack &&
          glyph.bottom > box.top - slack;
        if (text !== undefined && glyph !== undefined && leadsIt) {
          const offLine = middleOf(box) - middleOf(glyph);
          const offBlock =
            middleOf(box) -
            middleOf(blockBeside(icon, text).getBoundingClientRect());
          if (Math.abs(offLine) > tolerance && Math.abs(offBlock) > tolerance) {
            const words = (text.parentElement?.textContent ?? "")
              .trim()
              .slice(0, nameLength);
            problems.push(
              `the icon before “${words}” sits ${offLine.toFixed(1)}px off its first line's centre`,
            );
          }
        }
      }
      return problems;
    },
    {
      largest: LARGEST_ICON_PX,
      widestGap: WIDEST_ICON_GAP_PX,
      slack: ROW_SLACK_PX,
      levels: LEVELS_UP_TO_THE_TEXT,
      tolerance: CENTRE_TOLERANCE_PX,
      nameLength: NAME_LENGTH,
      controls: CONTROLS,
    },
  );
}
