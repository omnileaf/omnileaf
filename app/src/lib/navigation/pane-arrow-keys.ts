import type { Attachment } from "svelte/attachments";

const PANE_ITEMS = "a[href], button";

function targetIndex(
  key: string,
  current: number,
  count: number,
): number | undefined {
  switch (key) {
    case "ArrowDown":
      return Math.min(current + 1, count - 1);
    case "ArrowUp":
      return Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function shownItems(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>(PANE_ITEMS)].filter(
    (item) => item.getClientRects().length > 0,
  );
}

export const paneArrowKeys: Attachment<HTMLElement> = (list) => {
  function move(event: KeyboardEvent): void {
    if (hasModifier(event)) {
      return;
    }
    const items = shownItems(list);
    const current = items.findIndex((item) => item === event.target);
    const target =
      current === -1
        ? undefined
        : targetIndex(event.key, current, items.length);
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    items[target]?.focus();
  }

  list.addEventListener("keydown", move);
  return () => {
    list.removeEventListener("keydown", move);
  };
};
