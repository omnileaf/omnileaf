import type { Attachment } from "svelte/attachments";
import { SvelteSet } from "svelte/reactivity";

const slots = new SvelteSet<HTMLElement>();

function isAfter(slot: HTMLElement, other: HTMLElement): boolean {
  return (
    (other.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING) !==
    0
  );
}

function lastOnPage(): HTMLElement | undefined {
  let last: HTMLElement | undefined;
  for (const slot of slots) {
    if (last === undefined || isAfter(slot, last)) {
      last = slot;
    }
  }
  return last;
}

export const pageNoticeSlot = {
  get element(): HTMLElement | undefined {
    return lastOnPage();
  },
};

export const holdsPageNotices: Attachment<HTMLElement> = (element) => {
  slots.add(element);
  return () => {
    slots.delete(element);
  };
};
