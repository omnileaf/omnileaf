import { on } from "svelte/events";

const USER_INPUTS = ["pointerdown", "wheel", "keydown"] as const;
const SCROLL_SLACK_PX = 1;
const ANCHOR = "a[href]";

export interface ScrollAnchor {
  readonly href: string;
  readonly offset: number;
}

export interface ScrollPlace {
  readonly top: number;
  readonly anchor: ScrollAnchor | undefined;
}

function holdWhileContentResizes(
  screen: HTMLElement,
  reach: (stop: () => void) => void,
  onStop: () => void = () => undefined,
): () => void {
  const observer = new ResizeObserver(() => {
    reach(stop);
  });
  const stopListening = USER_INPUTS.map((input) => on(screen, input, stop));

  function stop(): void {
    observer.disconnect();
    for (const stopInput of stopListening) {
      stopInput();
    }
    onStop();
  }

  for (const content of screen.children) {
    observer.observe(content);
  }
  reach(stop);
  return stop;
}

export function holdScrollTop(screen: HTMLElement, top: number): () => void {
  return holdWhileContentResizes(screen, (stop) => {
    screen.scrollTop = top;
    if (screen.scrollTop >= top - SCROLL_SLACK_PX) {
      stop();
    }
  });
}

function isShown(link: HTMLAnchorElement): boolean {
  return link.getBoundingClientRect().height > 0;
}

function isPinned(link: HTMLAnchorElement, screen: HTMLElement): boolean {
  for (
    let at: HTMLElement | null = link;
    at !== null && at !== screen;
    at = at.parentElement
  ) {
    if (["sticky", "fixed"].includes(getComputedStyle(at).position)) {
      return true;
    }
  }
  return false;
}

function anchorIn(
  screen: HTMLElement,
  leavingFor: URL | undefined,
): HTMLAnchorElement | null {
  const box = screen.getBoundingClientRect();
  const inView = [...screen.querySelectorAll<HTMLAnchorElement>(ANCHOR)].filter(
    (link) => {
      const shown = link.getBoundingClientRect();
      return (
        isShown(link) &&
        shown.top >= box.top &&
        shown.bottom <= box.bottom &&
        !isPinned(link, screen)
      );
    },
  );
  return (
    inView.find((link) => link.pathname === leavingFor?.pathname) ??
    inView.at(0) ??
    null
  );
}

export function placeOf(
  screen: HTMLElement,
  leavingFor: URL | undefined,
): ScrollPlace {
  const shownTop = screen.getBoundingClientRect().top;
  const anchor = anchorIn(screen, leavingFor);
  return {
    top: screen.scrollTop,
    anchor:
      anchor === null
        ? undefined
        : {
            href: anchor.getAttribute("href") ?? "",
            offset: anchor.getBoundingClientRect().top - shownTop,
          },
  };
}

function contentTopOf(link: HTMLAnchorElement, screen: HTMLElement): number {
  return (
    link.getBoundingClientRect().top -
    screen.getBoundingClientRect().top +
    screen.scrollTop
  );
}

function anchorOf(
  screen: HTMLElement,
  anchor: ScrollAnchor,
  savedAt: number,
): HTMLAnchorElement | null {
  const shown = [
    ...screen.querySelectorAll<HTMLAnchorElement>(
      `${ANCHOR}[href="${CSS.escape(anchor.href)}"]`,
    ),
  ].filter(isShown);
  const distanceFromSaved = (link: HTMLAnchorElement): number =>
    Math.abs(contentTopOf(link, screen) - savedAt);
  return shown.reduce<HTMLAnchorElement | null>(
    (nearest, link) =>
      nearest === null || distanceFromSaved(link) < distanceFromSaved(nearest)
        ? link
        : nearest,
    null,
  );
}

function scrollToPlace(screen: HTMLElement, place: ScrollPlace): void {
  const { anchor } = place;
  if (anchor === undefined) {
    screen.scrollTop = place.top;
    return;
  }
  const link = anchorOf(screen, anchor, place.top + anchor.offset);
  if (link === null) {
    screen.scrollTop = place.top;
    return;
  }
  screen.scrollTop = contentTopOf(link, screen) - anchor.offset;
}

export function holdScrollPlace(
  screen: HTMLElement,
  place: ScrollPlace,
): () => void {
  let placedAt = screen.scrollTop;
  const anchoring = screen.style.overflowAnchor;
  screen.style.overflowAnchor = "none";
  const stopWatching = on(screen, "scroll", () => {
    if (Math.abs(screen.scrollTop - placedAt) > SCROLL_SLACK_PX) {
      stop();
    }
  });
  const stop = holdWhileContentResizes(
    screen,
    () => {
      scrollToPlace(screen, place);
      placedAt = screen.scrollTop;
    },
    () => {
      stopWatching();
      screen.style.overflowAnchor = anchoring;
    },
  );
  return stop;
}
