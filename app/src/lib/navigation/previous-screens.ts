export interface ScreenCopy {
  readonly content: HTMLElement;
  readonly scrollTop: number;
}

export class PreviousScreens {
  readonly #copies = new Map<string, ScreenCopy>();

  keep(pathname: string, screen: HTMLElement): void {
    this.#copies.set(pathname, copyOf(screen));
  }

  of(pathname: string): ScreenCopy | undefined {
    return this.#copies.get(pathname);
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
