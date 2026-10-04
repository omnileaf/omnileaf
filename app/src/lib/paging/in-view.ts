import type { Attachment } from "svelte/attachments";

/** Calls `onNear` once the element scrolls into view, and again each time it is attached while still in view. */
export function whenInView(onNear: () => void): Attachment<HTMLElement> {
  return (element) => {
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((entry) => entry.isIntersecting)) {
        onNear();
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  };
}
