import type { Attachment } from "svelte/attachments";

export type PaneName = "settings" | "jump";

function isDrawn(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

export function holdsFocusFor(pane: PaneName): Attachment<HTMLElement> {
  return (element) => {
    element.querySelector("button")?.focus({ preventScroll: true });
    return () => {
      [...document.querySelectorAll<HTMLElement>(`[data-pane="${pane}"]`)]
        .find(isDrawn)
        ?.focus({ preventScroll: true });
    };
  };
}
