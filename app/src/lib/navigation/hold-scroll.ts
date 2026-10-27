import { on } from "svelte/events";

const USER_INPUTS = ["pointerdown", "wheel", "keydown"] as const;
const SCROLL_SLACK_PX = 1;

export function holdScrollTop(screen: HTMLElement, top: number): () => void {
  const observer = new ResizeObserver(reach);
  const stopListening = USER_INPUTS.map((input) => on(screen, input, stop));

  function stop(): void {
    observer.disconnect();
    for (const stopInput of stopListening) {
      stopInput();
    }
  }

  function reach(): void {
    screen.scrollTop = top;
    if (screen.scrollTop >= top - SCROLL_SLACK_PX) {
      stop();
    }
  }

  for (const content of screen.children) {
    observer.observe(content);
  }
  reach();
  return stop;
}
