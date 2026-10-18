import type { Attachment } from "svelte/attachments";

/** WebKit can skip @starting-style on an element inserted after the page loads, so this resolves the element's style in the one frame bits-ui marks with data-starting-style, giving its entrance a place to start from. */
export const resolveFirstStyle: Attachment<HTMLElement> = (element) => {
  element.getBoundingClientRect();
};
