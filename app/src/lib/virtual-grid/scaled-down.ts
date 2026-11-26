import { onTestFinished } from "vitest";

const SHOWN_SCALE = 0.5;

export function scaledDown(
  inside: HTMLElement = document.body,
): HTMLDivElement {
  const holder = document.createElement("div");
  holder.style.transform = `scale(${String(SHOWN_SCALE)})`;
  holder.style.transformOrigin = "0 0";
  inside.append(holder);
  onTestFinished(() => {
    holder.remove();
  });
  return holder;
}

export function drawnAt(holder: HTMLElement, transform: string): void {
  holder.style.transform = transform;
}
