import { createContext } from "svelte";

export interface ScreenCopy {
  readonly content: HTMLElement;
  readonly scrollTop: number;
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

  forgetAllButAbove(pathname: string): void {
    for (const kept of this.#copies.keys()) {
      if (!pathname.startsWith(`${kept}/`)) {
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
  return { content, scrollTop: screen.scrollTop };
}

export const [getPreviousScreens, setPreviousScreens] =
  createContext<PreviousScreens>();
