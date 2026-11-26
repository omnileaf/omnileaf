import { createContext } from "svelte";
import type { Attachment } from "svelte/attachments";

export interface ScreenCopy {
  readonly content: HTMLElement;
  readonly scrollTop: number;
}

export interface ScreenArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function areaStyle({ left, top, width, height }: ScreenArea): string {
  return `left: ${String(left)}px; top: ${String(top)}px; width: ${String(width)}px; height: ${String(height)}px;`;
}

export function showCopy(shown: ScreenCopy): Attachment<HTMLElement> {
  return (holder) => {
    holder.append(shown.content);
    shown.content.scrollTop = shown.scrollTop;
    return () => {
      shown.content.remove();
    };
  };
}

export class PreviousScreens {
  readonly #copies = new Map<string, ScreenCopy>();
  #landingOn: string | undefined;

  keep(pathname: string, screen: HTMLElement): void {
    this.#copies.set(pathname, copyOf(screen));
  }

  of(pathname: string): ScreenCopy | undefined {
    return this.#copies.get(pathname);
  }

  landOn(pathname: string): void {
    this.#landingOn = pathname;
  }

  cancelLanding(): void {
    this.#landingOn = undefined;
  }

  landedOn(pathname: string): ScreenCopy | undefined {
    const isLanding = this.#landingOn === pathname;
    this.#landingOn = undefined;
    return isLanding ? this.of(pathname) : undefined;
  }

  forgetAllBut(waysBack: ReadonlySet<string>): void {
    for (const kept of this.#copies.keys()) {
      if (!waysBack.has(kept)) {
        this.#copies.delete(kept);
      }
    }
  }

  forgetAll(): void {
    this.#copies.clear();
  }
}

function copyOf(screen: HTMLElement): ScreenCopy {
  const content = document.createElement("div");
  content.className = screen.className;
  content.append(...[...screen.childNodes].map((node) => node.cloneNode(true)));
  for (const identified of content.querySelectorAll("[id]")) {
    identified.removeAttribute("id");
  }
  for (const pressed of content.querySelectorAll("[data-pressed]")) {
    pressed.removeAttribute("data-pressed");
  }
  return { content, scrollTop: screen.scrollTop };
}

export const [getPreviousScreens, setPreviousScreens] =
  createContext<PreviousScreens>();
