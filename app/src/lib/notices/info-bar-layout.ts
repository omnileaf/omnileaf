import type { Attachment } from "svelte/attachments";

const WORDS = "[data-info-bar-words]";

function isCrowded(bar: HTMLElement): boolean {
  const words = bar.querySelector<HTMLElement>(WORDS);
  return words !== null && words.scrollWidth > words.clientWidth;
}

function layOut(bar: HTMLElement): void {
  bar.removeAttribute("data-stacked");
  bar.toggleAttribute("data-stacked", isCrowded(bar));
}

export const stacksWhenCrowded: Attachment<HTMLElement> = (bar) => {
  let frame: number | undefined;
  const layOutNextFrame = (): void => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
    frame = requestAnimationFrame(() => {
      frame = undefined;
      layOut(bar);
    });
  };
  layOut(bar);
  const resizes = new ResizeObserver(layOutNextFrame);
  resizes.observe(bar);
  const edits = new MutationObserver(layOutNextFrame);
  edits.observe(bar, { characterData: true, childList: true, subtree: true });
  return () => {
    resizes.disconnect();
    edits.disconnect();
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  };
};
