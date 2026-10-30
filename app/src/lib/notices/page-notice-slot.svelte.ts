import type { Attachment } from "svelte/attachments";

let slot: HTMLElement | undefined = $state();

export const pageNoticeSlot = {
  get element(): HTMLElement | undefined {
    return slot;
  },
};

export const holdsPageNotices: Attachment<HTMLElement> = (element) => {
  slot = element;
  return () => {
    if (slot === element) {
      slot = undefined;
    }
  };
};
