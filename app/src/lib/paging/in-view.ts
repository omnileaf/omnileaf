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

const NEAR_THE_SCREEN = "100% 0px";

export function whileNear(
  onChange: (isNear: boolean) => void,
): Attachment<HTMLElement> {
  return (element) => {
    const observer = new IntersectionObserver(
      (seen) => {
        const latest = seen.at(-1);
        if (latest !== undefined) {
          onChange(latest.isIntersecting);
        }
      },
      { rootMargin: NEAR_THE_SCREEN },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  };
}
