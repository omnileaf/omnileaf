import type { Attachment } from "svelte/attachments";

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
