import type { Attachment } from "svelte/attachments";
import { on } from "svelte/events";

/** Publishes, as the given custom property, how far an element's top sits above the window's bottom, so toasts can rest above it. */
export function makesToastRoom(property: string): Attachment<HTMLElement> {
  return (element) => {
    const root = document.documentElement;
    const measure = (): void => {
      const room = window.innerHeight - element.getBoundingClientRect().top;
      root.style.setProperty(property, `${String(room)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const stopListening = on(window, "resize", measure);
    return () => {
      observer.disconnect();
      stopListening();
      root.style.removeProperty(property);
    };
  };
}
