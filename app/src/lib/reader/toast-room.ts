import type { Attachment } from "svelte/attachments";
import { on } from "svelte/events";

const TOAST_ROOM = "--reader-toast-room";

/** Publishes how far the bar's top sits above the window's bottom, so the reader's toasts can rest above it. */
export const makesToastRoom: Attachment<HTMLElement> = (bar) => {
  const root = document.documentElement;
  const measure = (): void => {
    const room = window.innerHeight - bar.getBoundingClientRect().top;
    root.style.setProperty(TOAST_ROOM, `${String(room)}px`);
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(bar);
  const stopListening = on(window, "resize", measure);
  return () => {
    observer.disconnect();
    stopListening();
    root.style.removeProperty(TOAST_ROOM);
  };
};
